import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { BarChart3, ShieldCheck, Trash2, Users, UserPen } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { MODES } from "@/lib/modes";
import { getGateId, updateGate } from "@/lib/gate.functions";
import { disableAccount, resetAccountPin } from "@/lib/accounts.functions";
import type { Writer } from "@/lib/purchases";

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
        <ShieldCheck className="size-5 text-primary" /> 初期認証（管理者）
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

type Acc = { id: string; name: string; slug: string; pin: string | null; admin: boolean; modes: string[] };

/** アカウント一覧：アカウント名（＝職場名）・ID・4桁パスワード・利用モード（管理者のみ） */
export function AccountModes() {
  const disable = useServerFn(disableAccount);
  const resetPin = useServerFn(resetAccountPin);
  const [list, setList] = useState<Acc[] | null>(null);
  const [pinEdit, setPinEdit] = useState<Record<string, string>>({});
  const load = async () => {
    const [{ data: ps }, { data: roles }, { data: ms }, { data: pins }] = await Promise.all([
      supabase.from("profiles").select("id,name,slug").is("disabled_at", null).order("created_at"),
      supabase.from("user_roles").select("user_id,role"),
      supabase.from("account_modes").select("user_id,mode"),
      supabase.from("account_pins").select("user_id,pin"),
    ]);
    setList(
      (ps ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        pin: pins?.find((x) => x.user_id === p.id)?.pin ?? null,
        admin: !!roles?.some((r) => r.user_id === p.id && r.role === "admin"),
        modes: (ms ?? []).filter((m) => m.user_id === p.id).map((m) => m.mode),
      })),
    );
  };
  useEffect(() => { void load(); }, []);

  const toggle = async (a: Acc, mode: string, on: boolean) => {
    const { error } = on
      ? await supabase.from("account_modes").insert({ user_id: a.id, mode })
      : await supabase.from("account_modes").delete().eq("user_id", a.id).eq("mode", mode);
    if (error) toast.error("変更に失敗しました");
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
        <Users className="size-5 text-primary" /> アカウント一覧（管理者）
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">アカウント名がそのまま物品購入の「職場」になります。管理者はすべてのモードを利用できます。</p>
      <ul className="mt-3 space-y-3">
        {(list ?? []).map((a) => (
          <li key={a.id} className="rounded-xl border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold">{a.name}{a.admin ? <span className="ml-2 text-xs text-primary">管理者</span> : null}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">ID：{a.slug}</div>
              </div>
              {!a.admin ? (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(a)}>
                  <Trash2 className="size-4" /> 削除
                </Button>
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm">
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
            </div>
            {!a.admin ? (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                {MODES.map((m) => (
                  <label key={m.key} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={a.modes.includes(m.key)} onCheckedChange={(c) => toggle(a, m.key, !!c)} />
                    {m.label}
                  </label>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">「未記録」は、次回そのアカウントでログインした時に表示されます。</p>
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
        <UserPen className="size-5 text-primary" /> 記載者設定（管理者）
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">物品購入の記載者欄で、ふりがなから候補が出ます。</p>
      <details className="mt-3 rounded-lg border border-border">
      <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-bold">登録済みの記載者（{list.length}名）を表示</summary>
      <div className="px-3 pb-3">
      <Input className="mb-2 h-10" placeholder="一覧から探す（氏名・ふりがな）" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <ul className="max-h-80 space-y-2 overflow-auto">
        {list.filter((w) => !filter || w.name.includes(filter) || w.kana.includes(filter)).map((w) => (
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
        <BarChart3 className="size-5 text-primary" /> 物品購入 分析（管理者）
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">発注先別の支払額・割合、金額推移を確認できます。</p>
      <Button asChild variant="outline" className="mt-3 h-12 w-full bg-card">
        <Link to="/purchase-analytics">分析を開く</Link>
      </Button>
    </section>
  );
}
