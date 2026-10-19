import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { BarChart3, Building2, ShieldCheck, Trash2, Users, UserPen } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FEATURES, MODES } from "@/lib/modes";
import { useAuth } from "@/lib/auth";
import { getGateId, updateGate } from "@/lib/gate.functions";
import { disableAccount, resetAccountPin } from "@/lib/accounts.functions";
import { toHira, type Writer } from "@/lib/purchases";

const card = "rounded-2xl border border-border bg-card p-4";

/** 初期認証 ID/PASS 変更（管理者のみ） */
export function GateSettings() {
  const getId = useServerFn(getGateId);
  const save = useServerFn(updateGate);
  const [id, setId] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void getId().then((r) => setId(r.id)).catch(() => {});
  }, []);
  const submit = async () => {
    if (id.trim().length < 4 || pass.length < 6) {
      toast.error("IDは4文字以上、PASSは6文字以上で入力してください");
      return;
    }
    setBusy(true);
    try {
      await save({ data: { id: id.trim(), pass } });
      setPass("");
      toast.success("初期認証のID・PASSを変更しました");
    } catch {
      toast.error("変更に失敗しました");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={card}>
      <h2 className="flex items-center gap-2 text-base font-bold">
        <ShieldCheck className="size-5 text-primary" /> 初期認証
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">新しい端末で最初に入力するID・PASSです。認証済みの端末はそのまま使えます。</p>
      <div className="mt-3 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="gate-id">ID</Label>
          <Input id="gate-id" className="h-12" value={id} onChange={(e) => setId(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gate-pass">新しいPASS</Label>
          <Input id="gate-pass" type="password" className="h-12" value={pass} onChange={(e) => setPass(e.target.value)} />
        </div>
        <Button className="h-12 w-full" disabled={busy} onClick={submit}>変更する</Button>
      </div>
    </section>
  );
}

type Acc = { id: string; name: string; slug: string; workplace: string | null; pin: string | null; admin: boolean; modes: string[] };

/** アカウント一覧：アカウント名（＝職場名）・ID・4桁パスワード・利用モード（管理者のみ） */
export function AccountModes() {
  const { isAdmin } = useAuth();
  const disable = useServerFn(disableAccount);
  const resetPin = useServerFn(resetAccountPin);
  const [list, setList] = useState<Acc[] | null>(null);
  const [pinEdit, setPinEdit] = useState<Record<string, string>>({});
  const load = async () => {
    const [{ data: ps }, { data: roles }, { data: ms }, { data: pins }] = await Promise.all([
      supabase.from("profiles").select("id,name,slug,workplace").is("disabled_at", null).order("created_at"),
      isAdmin ? supabase.from("user_roles").select("user_id,role") : Promise.resolve({data:[]}),
      isAdmin ? supabase.from("account_modes").select("user_id,mode") : Promise.resolve({data:[]}),
      isAdmin ? supabase.from("account_pins").select("user_id,pin") : Promise.resolve({data:[]}),
    ]);
    setList(
      (ps ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        workplace: p.workplace,
        pin: pins?.find((x) => x.user_id === p.id)?.pin ?? null,
        admin: !!roles?.some((r) => r.user_id === p.id && r.role === "admin"),
        modes: (()=>{const keys=(ms ?? []).filter((m)=>m.user_id===p.id).map((m)=>m.mode);if(keys.some((k)=>["settings.writers","settings.suppliers","settings.analytics"].includes(k)))keys.push("purchases.settings");return keys;})(),
      })),
    );
  };
  useEffect(() => { void load(); }, []);

  const toggle = async (a: Acc, mode: string, on: boolean) => {
    if(!isAdmin)return;
    if(mode==="purchases.settings" && !on){const {error}=await supabase.from("account_modes").delete().eq("user_id",a.id).in("mode",["purchases.settings","settings.writers","settings.suppliers","settings.analytics"]);if(error)toast.error("変更に失敗しました");void load();return;}
    const { error } = on
      ? await supabase.from("account_modes").insert({ user_id: a.id, mode })
      : await supabase.from("account_modes").delete().eq("user_id", a.id).eq("mode", mode);
    if (error) toast.error("変更に失敗しました");
    void load();
  };
  const saveWorkplace = async (a: Acc, v: string) => {
    const w = v.trim() || null;
    if (w === a.workplace) return;
    const { error } = await supabase.from("profiles").update({ workplace: w }).eq("id", a.id);
    if (error) toast.error("変更に失敗しました");
    else toast.success("職場名を変更しました（今後の登録から反映）");
    void load();
  };
  const savePin = async (a: Acc) => {
    const pin = pinEdit[a.id] ?? "";
    if (!/^\d{4}$/.test(pin)) { toast.error("4桁の数字で入力してください"); return; }
    try {
      await resetPin({ data: { userId: a.id, pin } });
      toast.success(`${a.name} のパスワードを変更しました`);
      setPinEdit((s) => { const n = { ...s }; delete n[a.id]; return n; });
      void load();
    } catch { toast.error("変更に失敗しました"); }
  };
  const remove = async (a: Acc) => {
    if (!window.confirm(`「${a.name}」を削除しますか？\n（過去の写真・物品購入などのデータは残ります）`)) return;
    try {
      await disable({ data: { userId: a.id } });
      toast.success("アカウントを削除しました");
      void load();
    } catch { toast.error("削除に失敗しました"); }
  };

  return (
    <section className={card}>
      <h2 className="flex items-center gap-2 text-base font-bold">
        <Users className="size-5 text-primary" /> アカウント一覧
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">物品購入の「職場」には、ここで設定した職場名（空欄可）が記録されます。管理者はすべての機能を利用できます。</p>
      <ul className="mt-3 space-y-3">
        {(list ?? []).map((a) => (
          <li key={a.id} className="rounded-xl border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold">{a.name}{a.admin ? <span className="ml-2 text-xs text-primary">管理者</span> : null}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">ID：{a.slug}</div>
              </div>
              {isAdmin && !a.admin ? (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(a)}>
                  <Trash2 className="size-4" /> 削除
                </Button>
              ) : null}
            </div>
            {!isAdmin ? (
              <div className="mt-1 text-xs text-muted-foreground">職場名：{a.workplace ?? "（空欄）"}</div>
            ) : (<>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="shrink-0 text-muted-foreground">職場名：</span>
              <Input
                key={a.workplace ?? ""}
                className="h-9"
                placeholder="（空欄）"
                defaultValue={a.workplace ?? ""}
                onBlur={(e) => saveWorkplace(a, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              />
            </div>
            {!a.admin ? <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="shrink-0 text-muted-foreground">4桁パスワード：</span>
              {pinEdit[a.id] !== undefined ? (
                <>
                  <Input className="h-9 w-24" inputMode="numeric" maxLength={4} value={pinEdit[a.id]} onChange={(e) => setPinEdit({ ...pinEdit, [a.id]: e.target.value.replace(/\D/g, "") })} />
                  <Button size="sm" className="h-9" onClick={() => savePin(a)}>保存</Button>
                  <Button size="sm" variant="ghost" className="h-9" onClick={() => setPinEdit((s) => { const n = { ...s }; delete n[a.id]; return n; })}>取消</Button>
                </>
              ) : (
                <>
                  <b className="font-mono text-base tracking-widest">{a.pin ?? "未記録"}</b>
                  <Button size="sm" variant="outline" className="h-8 bg-card" onClick={() => setPinEdit({ ...pinEdit, [a.id]: "" })}>変更</Button>
                </>
              )}
            </div> : null}
            {!a.admin ? (
              <div className="mt-3 space-y-2">
                {MODES.map((m) => (
                  <div key={m.key}>
                    <label className="flex items-center gap-2 text-sm font-bold">
                      <Checkbox checked={a.modes.includes(m.key)} onCheckedChange={(c) => toggle(a, m.key, !!c)} />
                      {m.label}
                    </label>
                    {m.perms && a.modes.includes(m.key) ? (
                      <div className="ml-7 mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
                        {m.perms.map((pm) => (
                          <label key={pm.key} className="flex items-center gap-2 text-xs">
                            <Checkbox checked={a.modes.includes(pm.key)} onCheckedChange={(c) => toggle(a, pm.key, !!c)} />
                            {pm.label}
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                <div className="border-t border-border pt-2 text-xs font-bold text-muted-foreground">設定・その他の機能</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {FEATURES.map((f) => (
                    <label key={f.key} className="flex items-center gap-2 text-xs">
                      <Checkbox checked={a.modes.includes(f.key)} onCheckedChange={(c) => toggle(a, f.key, !!c)} />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            </>)}
          </li>
        ))}
      </ul>
      {isAdmin ? <p className="mt-2 text-xs text-muted-foreground">権限の変更は管理者のみ行えます。「未記録」は、次回そのアカウントでログインした時に表示されます。</p> : null}
    </section>
  );
}

/** 記載者マスタ（管理者のみ） */
export function WriterMaster() {
  const [list, setList] = useState<Writer[]>([]);
  const [name, setName] = useState("");
  const [kana, setKana] = useState("");
  const [filter, setFilter] = useState("");
  const load = async () => {
    const { data } = await supabase.from("purchase_writers").select("id,name,kana").order("kana");
    setList((data as Writer[]) ?? []);
  };
  useEffect(() => { void load(); }, []);
  const add = async () => {
    if (!name.trim() || !kana.trim()) { toast.error("氏名とふりがなを入力してください"); return; }
    const { error } = await supabase.from("purchase_writers").insert({ name: name.trim(), kana: kana.trim() });
    if (error) { toast.error("追加に失敗しました"); return; }
    setName(""); setKana(""); void load();
  };
  const upd = async (w: Writer, patch: Partial<Writer>) => {
    await supabase.from("purchase_writers").update(patch).eq("id", w.id);
    void load();
  };
  const del = async (w: Writer) => {
    await supabase.from("purchase_writers").delete().eq("id", w.id);
    void load();
  };
  return (
    <section className={card}>
      <h2 className="flex items-center gap-2 text-base font-bold">
        <UserPen className="size-5 text-primary" /> 記載者設定
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">物品購入の記載者欄で、ふりがなから候補が出ます。</p>
      <details className="mt-3 rounded-lg border border-border">
      <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-bold">登録済みの記載者（{list.length}名）を表示</summary>
      <div className="px-3 pb-3">
      <Input className="mb-2 h-10" placeholder="一覧から探す（氏名・ふりがな）" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <ul className="max-h-80 space-y-2 overflow-auto">
        {list.filter((w) => !filter || toHira(w.name).includes(toHira(filter)) || toHira(w.kana).includes(toHira(filter))).map((w) => (
          <li key={w.id} className="flex items-center gap-2">
            <Input className="h-10" defaultValue={w.name} aria-label="氏名" onBlur={(e) => e.target.value.trim() && e.target.value !== w.name && upd(w, { name: e.target.value.trim() })} />
            <Input className="h-10" defaultValue={w.kana} aria-label="ふりがな" onBlur={(e) => e.target.value.trim() && e.target.value !== w.kana && upd(w, { kana: e.target.value.trim() })} />
            <Button size="icon" variant="ghost" className="shrink-0 text-destructive" aria-label="削除" onClick={() => del(w)}><Trash2 className="size-4" /></Button>
          </li>
        ))}
      </ul>
      </div>
      </details>
      <div className="mt-3 flex items-center gap-2">
        <Input className="h-11" placeholder="氏名（例：田中）" value={name} onChange={(e) => setName(e.target.value)} />
        <Input className="h-11" placeholder="ふりがな（たなか）" value={kana} onChange={(e) => setKana(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button className="h-11 shrink-0" onClick={add}>追加</Button>
      </div>
    </section>
  );
}

export function AnalyticsLink() {
  return (
    <section className={card}>
      <h2 className="flex items-center gap-2 text-base font-bold">
        <BarChart3 className="size-5 text-primary" /> 物品購入 分析
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">発注先別の支払額・割合、金額推移を確認できます。</p>
      <Button asChild variant="outline" className="mt-3 h-12 w-full bg-card">
        <Link to="/purchase-analytics">分析を開く</Link>
      </Button>
    </section>
  );
}

export type Supplier = { id: string; name: string; vendor_no: string };

/** 発注先設定（発注先名と業者番号。管理者のみ） */
export function SupplierMaster() {
  const [list, setList] = useState<Supplier[]>([]);
  const [name, setName] = useState("");
  const [no, setNo] = useState("");
  const [filter, setFilter] = useState("");
  const load = async () => {
    const { data } = await supabase.from("purchase_suppliers").select("id,name,vendor_no").order("name");
    setList((data as Supplier[]) ?? []);
  };
  useEffect(() => { void load(); }, []);
  const add = async () => {
    if (!name.trim()) { toast.error("発注先名を入力してください"); return; }
    const { error } = await supabase.from("purchase_suppliers").insert({ name: name.trim(), vendor_no: no.trim() });
    if (error) { toast.error("追加に失敗しました（同じ名前が登録済みの可能性があります）"); return; }
    setName(""); setNo(""); void load();
  };
  const upd = async (s: Supplier, patch: Partial<Supplier>) => {
    const { error } = await supabase.from("purchase_suppliers").update(patch).eq("id", s.id);
    if (error) toast.error("変更に失敗しました");
    void load();
  };
  const del = async (s: Supplier) => {
    if (!window.confirm(`「${s.name}」を削除しますか？`)) return;
    await supabase.from("purchase_suppliers").delete().eq("id", s.id);
    void load();
  };
  return (
    <section className={card}>
      <h2 className="flex items-center gap-2 text-base font-bold">
        <Building2 className="size-5 text-primary" /> 発注先設定
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">発注先欄の候補と、発注検収の業者番号の自動入力に使います。</p>
      <details className="mt-3 rounded-lg border border-border">
        <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-bold">登録済みの発注先（{list.length}件）を表示</summary>
        <div className="px-3 pb-3">
          <Input className="mb-2 h-10" placeholder="一覧から探す" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <ul className="max-h-80 space-y-2 overflow-auto">
            {list.filter((s) => !filter || toHira(s.name).includes(toHira(filter)) || toHira(s.vendor_no).includes(toHira(filter))).map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <Input className="h-10" defaultValue={s.name} aria-label="発注先名" onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && upd(s, { name: e.target.value.trim() })} />
                <Input className="h-10 w-24 shrink-0" defaultValue={s.vendor_no} aria-label="業者番号" onBlur={(e) => e.target.value !== s.vendor_no && upd(s, { vendor_no: e.target.value.trim() })} />
                <Button size="icon" variant="ghost" className="shrink-0 text-destructive" aria-label="削除" onClick={() => del(s)}><Trash2 className="size-4" /></Button>
              </li>
            ))}
          </ul>
        </div>
      </details>
      <div className="mt-3 flex items-center gap-2">
        <Input className="h-11" placeholder="発注先名" value={name} onChange={(e) => setName(e.target.value)} />
        <Input className="h-11 w-28 shrink-0" placeholder="業者番号" value={no} onChange={(e) => setNo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button className="h-11 shrink-0" onClick={add}>追加</Button>
      </div>
    </section>
  );
}
