import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SupplierInput } from "@/components/PurchaseExtras";
import type { Supplier } from "@/components/AdminSettings";
import { useAuth } from "@/lib/auth";
import { copyText, fmtNum, fmtYMD, fmtYen, type Purchase } from "@/lib/purchases";

/**
 * 発注検収（管理者のみ）。物品購入データ（承認済）をそのまま扱い、
 * 検収番号・業者番号は purchase_admin_fields に保存する（二重管理しない）。
 */
type Row = Purchase & { inspection_no: string; vendor_no: string };
type K = "written_on" | "item_name" | "model" | "quantity" | "unit" | "supplier" | "delivered_on" | "amount" | "inspection_no" | "vendor_no";
type Draft = Record<K, string>;

const COLS: { k: K; label: string; w: string; right?: boolean; type?: string }[] = [
  { k: "written_on", label: "記載日", w: "w-32", type: "date" },
  { k: "item_name", label: "品名", w: "w-40" },
  { k: "model", label: "型式", w: "w-36" },
  { k: "quantity", label: "数量", w: "w-16", right: true },
  { k: "unit", label: "単位", w: "w-14" },
  { k: "supplier", label: "発注先", w: "w-40" },
  { k: "delivered_on", label: "納品日", w: "w-32", type: "date" },
  { k: "amount", label: "単価", w: "w-24", right: true },
  { k: "inspection_no", label: "検収番号", w: "w-24" },
  { k: "vendor_no", label: "業者番号", w: "w-24" },
];

const today = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const blank = (): Draft => ({ written_on: today(), item_name: "", model: "", quantity: "", unit: "", supplier: "", delivered_on: "", amount: "", inspection_no: "", vendor_no: "" });
const toDraft = (r: Row): Draft => ({
  written_on: r.written_on, item_name: r.item_name, model: r.model ?? "", quantity: fmtNum(r.quantity), unit: r.unit ?? "",
  supplier: r.supplier ?? "", delivered_on: r.delivered_on ?? "", amount: r.amount == null ? "" : String(Number(r.amount)),
  inspection_no: r.inspection_no, vendor_no: r.vendor_no,
});
const text = (r: Row, k: K) =>
  k === "written_on" || k === "delivered_on" ? fmtYMD(r[k]) : k === "amount" ? fmtYen(r.amount) : k === "quantity" ? fmtNum(r.quantity) : String(r[k] ?? "");
const num = (s: string) => {
  const t = s.replace(/[,円\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export function InspectionView({ suppliers }: { suppliers: Supplier[] }) {
  const { session } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [withDelivered, setWithDelivered] = useState(false);
  const [sort, setSort] = useState<{ k: K; dir: 1 | -1 }>({ k: "written_on", dir: 1 });
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft>(blank());
  const [draft, setDraft] = useState<Draft>(blank());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const statuses = withDelivered ? ["approved", "delivered"] : ["approved"];
    const { data } = await supabase
      .from("purchases")
      .select("id,user_id,workplace,written_on,writer,item_name,model,note,quantity,unit,status,supplier,delivered_on,amount,check_reason,created_at")
      .is("deleted_at", null)
      .in("status", statuses)
      .order("written_on")
      .order("created_at")
      .limit(5000);
    const list = (data as Purchase[]) ?? [];
    const adm: Record<string, { inspection_no: string | null; vendor_no: string | null }> = {};
    for (let i = 0; i < list.length; i += 200) {
      const { data: a } = await supabase
        .from("purchase_admin_fields")
        .select("purchase_id,inspection_no,vendor_no")
        .in("purchase_id", list.slice(i, i + 200).map((r) => r.id));
      (a ?? []).forEach((x) => (adm[x.purchase_id] = x));
    }
    setRows(list.map((r) => ({ ...r, inspection_no: adm[r.id]?.inspection_no ?? "", vendor_no: adm[r.id]?.vendor_no ?? "" })));
  }, [withDelivered]);
  useEffect(() => { void load(); }, [load]);

  const view = useMemo(() => {
    if (!rows) return [];
    const v = (r: Row): string | number => {
      if (sort.k === "quantity") return r.quantity ?? -Infinity;
      if (sort.k === "amount") return r.amount ?? -Infinity;
      if (sort.k === "written_on") return r.written_on + r.created_at;
      return String(r[sort.k] ?? "");
    };
    return [...rows].sort((a, b) => {
      const x = v(a), y = v(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ja")) * sort.dir;
    });
  }, [rows, sort]);

  const vendorOf = (name: string) => suppliers.find((s) => s.name === name.trim())?.vendor_no ?? "";

  const persist = async (id: string | null, d: Draft) => {
    const base = {
      written_on: d.written_on || today(),
      item_name: d.item_name.trim(),
      model: d.model.trim() || null,
      quantity: num(d.quantity),
      unit: d.unit.trim() || null,
      supplier: d.supplier.trim() || null,
      delivered_on: d.delivered_on || null,
      amount: num(d.amount),
    };
    let pid = id;
    if (pid) {
      const { error } = await supabase.from("purchases").update(base).eq("id", pid);
      if (error) return false;
    } else {
      if (!session) return false;
      const { data, error } = await supabase
        .from("purchases")
        .insert({ ...base, user_id: session.user.id, writer: "管理者", status: "approved" })
        .select("id")
        .single();
      if (error || !data) return false;
      pid = data.id;
    }
    const { error } = await supabase.from("purchase_admin_fields").upsert({
      purchase_id: pid!,
      inspection_no: d.inspection_no.trim() || null,
      vendor_no: d.vendor_no.trim() || null,
      updated_at: new Date().toISOString(),
    });
    return !error;
  };

  const add = async () => {
    if (!draft.item_name.trim()) { toast.error("品名を入力してください"); return; }
    setBusy(true);
    const ok = await persist(null, draft);
    setBusy(false);
    if (!ok) { toast.error("登録できませんでした"); return; }
    toast.success("登録しました（記入・履歴にも反映されます）");
    setDraft(blank());
    void load();
  };
  const saveEdit = async (id: string) => {
    if (!edit.item_name.trim()) { toast.error("品名を入力してください"); return; }
    if (!(await persist(id, edit))) { toast.error("修正できませんでした"); return; }
    toast.success("修正しました");
    setEditing(null);
    void load();
  };
  const remove = async (r: Row) => {
    if (!window.confirm(`「${r.item_name}」を削除しますか？\n記入・履歴からも消え、ごみ箱扱いになります。`)) return;
    const { error } = await supabase.from("purchases").update({ deleted_at: new Date().toISOString() }).eq("id", r.id);
    if (error) toast.error("削除に失敗しました");
    else toast.success("削除しました");
    void load();
  };
  const copy = async (t: string) => {
    if (t && (await copyText(t))) toast.success(`コピー: ${t}`, { duration: 1200 });
  };

  const inputs = (d: Draft, set: (d: Draft) => void, onEnter: () => void) =>
    COLS.map((c) => (
      <td key={c.k} className="border-b border-r border-border p-1 align-top">
        {c.k === "supplier" ? (
          <SupplierInput
            className="h-10"
            value={d.supplier}
            suppliers={suppliers}
            onChange={(v) => set({ ...d, supplier: v })}
            onCommit={(v) => {
              const no = vendorOf(v);
              if (no) set({ ...d, supplier: v, vendor_no: no });
            }}
          />
        ) : (
          <Input
            className={`h-10 min-w-0 px-1.5 text-sm ${c.right ? "text-right" : ""}`}
            type={c.type ?? "text"}
            inputMode={c.k === "quantity" || c.k === "amount" ? "decimal" : undefined}
            placeholder={c.label}
            aria-label={c.label}
            value={d[c.k]}
            onChange={(e) => set({ ...d, [c.k]: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && onEnter()}
          />
        )}
      </td>
    ));

  return (
    <main className="mx-auto max-w-[1500px] px-3 pb-24 pt-3">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
        <h2 className="text-lg font-bold">発注検収</h2>
        <span className="text-muted-foreground">🟢 承認済 {rows?.length ?? 0}件</span>
        <label className="ml-auto flex items-center gap-2 text-xs">
          <Checkbox checked={withDelivered} onCheckedChange={(c) => setWithDelivered(!!c)} /> 納品済も表示
        </label>
      </div>
      {rows === null ? (
        <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-primary" /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-max min-w-full border-collapse text-sm">
            <thead className="bg-secondary text-secondary-foreground">
              <tr>
                {COLS.map((c) => (
                  <th key={c.k} className={`${c.w} border-b border-r border-border px-2 py-2 text-left text-xs font-bold whitespace-nowrap`}>
                    <button type="button" className="inline-flex items-center gap-0.5" onClick={() => setSort((s) => (s.k === c.k ? { k: c.k, dir: (s.dir * -1) as 1 | -1 } : { k: c.k, dir: 1 }))}>
                      {c.label}
                      {sort.k === c.k ? sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
                    </button>
                  </th>
                ))}
                <th className="border-b border-border px-2 py-2 text-left text-xs font-bold">操作</th>
              </tr>
            </thead>
            <tbody>
              {view.map((r) =>
                editing === r.id ? (
                  <tr key={r.id} className="bg-accent/30">
                    {inputs(edit, setEdit, () => saveEdit(r.id))}
                    <td className="border-b border-border p-1 whitespace-nowrap">
                      <Button size="sm" className="h-8" onClick={() => saveEdit(r.id)}>保存</Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(null)}>取消</Button>
                    </td>
                  </tr>
                ) : (
                  <tr key={r.id}>
                    {COLS.map((c) => {
                      const t = text(r, c.k);
                      return (
                        <td
                          key={c.k}
                          title={t ? "クリックでコピー" : undefined}
                          onClick={() => copy(t)}
                          className={`cursor-copy border-b border-r border-border px-2 py-2 align-top whitespace-pre-wrap break-words hover:bg-accent/40 ${c.right ? "text-right" : ""}`}
                        >
                          {t}
                        </td>
                      );
                    })}
                    <td className="border-b border-border px-1 py-1 whitespace-nowrap">
                      <Button size="icon" variant="ghost" className="size-8" aria-label="修正" title="修正" onClick={() => { setEdit(toDraft(r)); setEditing(r.id); }}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="size-8 text-destructive" aria-label="削除" title="削除" onClick={() => remove(r)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ),
              )}
              <tr className="bg-primary/5">
                {inputs(draft, setDraft, add)}
                <td className="p-1">
                  <Button className="h-10" disabled={busy} onClick={add}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} 登録
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">新規登録は記載者「管理者」・承認済として記入・履歴にも入ります。セルをタップするとコピーできます。</p>
    </main>
  );
}
