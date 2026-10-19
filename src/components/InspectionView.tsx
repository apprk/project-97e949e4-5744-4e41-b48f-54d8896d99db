import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PurchaseScroll } from "@/components/PurchaseScroll";
import { fetchPurchaseRows } from "@/lib/purchase-data";
import { SupplierInput } from "@/components/PurchaseExtras";
import type { Supplier } from "@/components/AdminSettings";
import { useAuth } from "@/lib/auth";
import { copyText, fmtNum, fmtYMD, fmtYen, comparePurchaseText, inspectionMatches, type Purchase } from "@/lib/purchases";

/**
 * 発注検収（管理者のみ）。物品購入データ（承認済）をそのまま扱い、
 * 検収番号・業者番号は purchase_admin_fields に保存する（二重管理しない）。
 */
type Row = Purchase & { inspection_no: string; vendor_no: string };
type K = "written_on" | "item_name" | "model" | "quantity" | "unit" | "supplier" | "delivered_on" | "amount" | "inspection_no" | "vendor_no";
type Draft = Record<K, string>;

const COLS: { k: K; label: string; w: string; right?: boolean; type?: string }[] = [
  { k: "written_on", label: "記載日", w: "w-32", type: "date" },
  { k: "inspection_no", label: "検収番号", w: "w-24" },
  { k: "item_name", label: "品名", w: "w-40" },
  { k: "model", label: "型式", w: "w-36" },
  { k: "quantity", label: "数量", w: "w-16", right: true },
  { k: "unit", label: "単位", w: "w-14" },
  { k: "supplier", label: "発注先", w: "w-40" },
  { k: "delivered_on", label: "納品日", w: "w-32", type: "date" },
  { k: "amount", label: "単価", w: "w-24", right: true },
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
  const { session, isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [withDelivered, setWithDelivered] = useState(true);
  const [numberFilter,setNumberFilter]=useState("all");
  const [sort, setSort] = useState<{ k: K; dir: 1 | -1 }>({ k: "written_on", dir: 1 });
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft>(blank());
  const [draft, setDraft] = useState<Draft>(blank());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const list=await fetchPurchaseRows(); setRows(list.map((r)=>({...r,inspection_no:r.inspection_no ?? "",vendor_no:r.vendor_no ?? ""}))); }
    catch { toast.error("発注検収を読み込めませんでした"); setRows([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const view = useMemo(() => {
    if (!rows) return [];
    const v = (r: Row): string | number => {
      if (sort.k === "quantity") return r.quantity ?? -Infinity;
      if (sort.k === "amount") return r.amount ?? -Infinity;
      if (sort.k === "written_on") return r.written_on + r.created_at;
      return String(r[sort.k] ?? "");
    };
    return rows.filter((r)=>inspectionMatches(r.status,r.inspection_no,withDelivered,numberFilter)).sort((a, b) => {
      const x = v(a), y = v(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : comparePurchaseText(String(x),String(y))) * sort.dir;
    });
  }, [rows, sort, withDelivered, numberFilter]);

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
    if (!pid) return false;
    // Supplier changes are resolved atomically by the existing database trigger.
    // Do not overwrite that value with a draft loaded before the supplier change.
    const supplierChanged = !id || (rows?.find((r) => r.id === id)?.supplier ?? "").trim() !== d.supplier.trim();
    const { error } = await supabase.rpc("save_inspection_numbers",{_id:pid,_inspection:d.inspection_no.trim(),_vendor:d.vendor_no.trim(),_set_vendor:!supplierChanged});
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
              set({ ...d, supplier: v, vendor_no: no });
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
        <span className="text-muted-foreground">{view.length}件</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <select aria-label="発注検収状態" className="h-10 rounded-md border border-input bg-background px-2" value={withDelivered ? "both" : "approved"} onChange={(e)=>setWithDelivered(e.target.value==="both")}><option value="approved">承認済のみ</option><option value="both">承認済＆納品済</option></select>
          <select aria-label="検収番号の絞り込み" className="h-10 rounded-md border border-input bg-background px-2" value={numberFilter} onChange={(e)=>setNumberFilter(e.target.value)}><option value="all">記載済＆未記載</option><option value="numbered">記載済のみ</option><option value="missing">未記載のみ</option></select>
        </div>
      </div>
      {rows === null ? (
        <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-primary" /></div>
      ) : (
        <PurchaseScroll>
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
                  <tr key={r.id} data-inspection-row={r.id}>
                    {COLS.map((c) => {
                      const t = text(r, c.k);
                    if (isAdmin && (c.k==="delivered_on" || c.k==="amount" || c.k==="inspection_no")) return <td key={c.k} className="border-b border-r border-border p-1"><InspectionInline row={r} field={c.k} onSaved={load}/></td>;
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
                      <Button disabled={!isAdmin} size="icon" variant="ghost" className="size-8" aria-label="修正" title="修正" onClick={() => { setEdit(toDraft(r)); setEditing(r.id); }}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button disabled={!isAdmin} size="icon" variant="ghost" className="size-8 text-destructive" aria-label="削除" title="削除" onClick={() => remove(r)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ),
              )}
              {isAdmin ? <tr className="bg-primary/5">
                {inputs(draft, setDraft, add)}
                <td className="p-1">
                  <Button className="h-10" disabled={busy} onClick={add}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} 登録
                  </Button>
                </td>
              </tr> : null}
            </tbody>
          </table>
        </PurchaseScroll>
      )}
      <p className="mt-2 text-xs text-muted-foreground">新規登録は記載者「管理者」・承認済として記入・履歴にも入ります。セルをタップするとコピーできます。</p>
    </main>
  );
}

function InspectionInline({row,field,onSaved}:{row:Row;field:"delivered_on"|"amount"|"inspection_no";onSaved:()=>Promise<void>}) {
 const original=field==="amount" ? (row.amount==null ? "" : String(row.amount)) : (row[field] ?? "");
 const [value,setValue]=useState(original);
 useEffect(()=>setValue(original),[original]);
 const commit=async()=>{
  if(value===original)return;
  const n=num(value);
  if(field==="amount" && value.trim() && n===null){toast.error("単価は数値で入力してください");setValue(original);return;}
  const result=field==="inspection_no" ? await supabase.rpc("save_inspection_numbers",{_id:row.id,_inspection:value.trim()}) : await supabase.from("purchases").update(field==="amount" ? {amount:n} : {delivered_on:value || null}).eq("id",row.id);
  if(result.error){toast.error("保存に失敗しました");setValue(original);return;}
  await onSaved();
 };
 return <Input aria-label={field==="amount" ? "単価" : field==="delivered_on" ? "納品日" : "検収番号"} type={field==="delivered_on" ? "date" : "text"} inputMode={field==="amount" ? "decimal" : undefined} className="h-9 min-w-0 px-1.5 text-sm" value={value} onChange={(e)=>setValue(e.target.value)} onBlur={()=>void commit()} onKeyDown={(e)=>e.key==="Enter" && e.currentTarget.blur()}/>;
}
