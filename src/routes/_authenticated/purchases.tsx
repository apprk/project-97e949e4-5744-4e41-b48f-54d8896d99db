import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Copy, Loader2, Pencil, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import {
  STATUS,
  copyText,
  fmtMD,
  fmtNum,
  fmtYMD,
  fmtYen,
  leadDays,
  matchWriters,
  statusText,
  toTsv,
  type Purchase,
  type PurchaseStatus,
  type Writer,
} from "@/lib/purchases";

export const Route = createFileRoute("/_authenticated/purchases")({
  head: () => ({
    meta: [
      { title: "物品購入 | 三条工場 業務管理" },
      { name: "description", content: "現場からの物品購入依頼、承認、納品記録、購入履歴。" },
      { property: "og:title", content: "物品購入 | 三条工場 業務管理" },
      { property: "og:description", content: "現場からの物品購入依頼、承認、納品記録、購入履歴。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PurchasesPage,
});

const SELECT = "id,user_id,workplace,written_on,writer,item_name,model,note,quantity,unit,status,supplier,delivered_on,amount,created_at";

type ColKey =
  | "written_on" | "workplace" | "writer" | "item_name" | "model" | "note" | "quantity" | "unit"
  | "status" | "lead" | "delivered_on" | "amount" | "supplier";

type Col = { key: ColKey; label: string; w: string; text: (p: Purchase) => string; align?: "right" };

const COLS: Record<ColKey, Col> = {
  written_on: { key: "written_on", label: "記載日", w: "w-16", text: (p) => fmtMD(p.written_on) },
  workplace: { key: "workplace", label: "職場", w: "w-24", text: (p) => p.workplace ?? "" },
  writer: { key: "writer", label: "記載者", w: "w-24", text: (p) => p.writer },
  item_name: { key: "item_name", label: "品名", w: "w-36", text: (p) => p.item_name },
  model: { key: "model", label: "型式", w: "w-32", text: (p) => p.model ?? "" },
  note: { key: "note", label: "備考", w: "w-32", text: (p) => p.note ?? "" },
  quantity: { key: "quantity", label: "数量", w: "w-16", text: (p) => fmtNum(p.quantity), align: "right" },
  unit: { key: "unit", label: "単位", w: "w-14", text: (p) => p.unit ?? "" },
  status: { key: "status", label: "状態", w: "w-24", text: (p) => statusText(p.status) },
  lead: { key: "lead", label: "目安納期", w: "w-20", text: (p) => { const d = leadDays(p); return d == null ? "" : `${d}日`; }, align: "right" },
  delivered_on: { key: "delivered_on", label: "納品日", w: "w-20", text: (p) => fmtMD(p.delivered_on) },
  amount: { key: "amount", label: "金額", w: "w-24", text: (p) => fmtYen(p.amount), align: "right" },
  supplier: { key: "supplier", label: "発注先", w: "w-32", text: (p) => p.supplier ?? "" },
};

const BASE: ColKey[] = ["writer", "item_name", "model", "note", "quantity", "unit", "status", "lead", "delivered_on", "amount", "supplier"];
const ENTRY_COLS: ColKey[] = ["written_on", ...BASE];
const HISTORY_COLS: ColKey[] = ["written_on", "workplace", ...BASE];

function PurchasesPage() {
  const [tab, setTab] = useState<"entry" | "history">("entry");
  const [writers, setWriters] = useState<Writer[]>([]);

  useEffect(() => {
    void supabase
      .from("purchase_writers")
      .select("id,name,kana")
      .order("kana")
      .then(({ data }) => setWriters((data as Writer[]) ?? []));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="物品購入" />
      <div className="mx-auto max-w-[1400px] px-3 pt-3">
        <div className="inline-flex rounded-xl border border-border bg-card p-1">
          {(["entry", "history"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-lg px-5 py-2 text-sm font-bold ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {t === "entry" ? "記入" : "履歴"}
            </button>
          ))}
        </div>
      </div>
      {tab === "entry" ? <EntryView writers={writers} /> : <HistoryView />}
    </div>
  );
}

/* ---------------- 共通: 一覧テーブル ---------------- */

function usePurchaseActions(reload: () => void) {
  const update = async (id: string, patch: Partial<Purchase>) => {
    const { error } = await supabase.from("purchases").update(patch).eq("id", id);
    if (error) {
      toast.error("更新に失敗しました");
      return false;
    }
    reload();
    return true;
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("purchases").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error("削除に失敗しました");
    else toast.success("削除しました");
    reload();
  };
  return { update, remove };
}

function PurchaseTable({
  rows,
  cols,
  footer,
  reload,
  sort,
  onSort,
  fullDate,
}: {
  fullDate?: boolean;
  rows: Purchase[];
  cols: ColKey[];
  footer?: React.ReactNode;
  reload: () => void;
  sort?: { key: ColKey; dir: 1 | -1 };
  onSort?: (k: ColKey) => void;
}) {
  const { isAdmin, session } = useAuth();
  const { update, remove } = usePurchaseActions(reload);
  const [editing, setEditing] = useState<string | null>(null);
  const txt = (k: ColKey, p: Purchase) =>
    fullDate && k === "written_on" ? fmtYMD(p.written_on) : fullDate && k === "delivered_on" ? fmtYMD(p.delivered_on) : COLS[k].text(p);

  const copyCell = async (t: string) => {
    if (!t) return;
    if (await copyText(t)) toast.success(`コピー: ${t}`, { duration: 1200 });
  };
  const copyRow = async (p: Purchase) => {
    if (await copyText(toTsv(cols.map((k) => (k === "status" ? STATUS[p.status].label : txt(k, p))))))
      toast.success("1行をコピーしました", { duration: 1200 });
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-max min-w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-secondary text-secondary-foreground">
          <tr>
            {cols.map((k) => (
              <th key={k} className={`${COLS[k].w} border-b border-r border-border px-2 py-2 text-left text-xs font-bold whitespace-nowrap`}>
                {onSort ? (
                  <button type="button" className="inline-flex items-center gap-0.5" onClick={() => onSort(k)}>
                    {COLS[k].label}
                    {sort?.key === k ? sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
                  </button>
                ) : (
                  COLS[k].label
                )}
              </th>
            ))}
            <th className="border-b border-border px-2 py-2 text-left text-xs font-bold">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) =>
            editing === p.id ? (
              <EditRow key={p.id} p={p} cols={cols} admin={isAdmin} onCancel={() => setEditing(null)} onSave={async (patch) => { if (await update(p.id, patch)) { setEditing(null); toast.success("修正しました"); } }} />
            ) : (
              <tr key={p.id} className={p.status === "rejected" ? "text-muted-foreground" : ""}>
                {cols.map((k) => {
                  const t = txt(k, p);
                  return (
                    <td
                      key={k}
                      title={t ? "クリックでコピー" : undefined}
                      onClick={() => copyCell(k === "status" ? STATUS[p.status].label : t)}
                      className={`cursor-copy border-b border-r border-border px-2 py-2 align-top whitespace-pre-wrap break-words hover:bg-accent/40 ${COLS[k].align === "right" ? "text-right" : ""} ${p.status === "rejected" && k !== "status" ? "line-through" : ""}`}
                    >
                      {t}
                    </td>
                  );
                })}
                <td className="border-b border-border px-1 py-1 whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    {isAdmin ? (
                      <>
                        <Button
                          size="sm"
                          variant={p.status === "approved" || p.status === "delivered" ? "default" : "outline"}
                          className="h-8 px-2"
                          disabled={p.status === "delivered"}
                          onClick={() => update(p.id, { status: p.status === "approved" ? "pending" : "approved" })}
                        >
                          <Check className="size-4" /> 承認
                        </Button>
                        <Button
                          size="sm"
                          variant={p.status === "rejected" ? "destructive" : "outline"}
                          className="h-8 px-2"
                          disabled={p.status === "delivered"}
                          onClick={() => update(p.id, { status: p.status === "rejected" ? "pending" : "rejected" })}
                        >
                          <X className="size-4" /> 却下
                        </Button>
                      </>
                    ) : null}
                    {isAdmin || (p.user_id === session?.user.id && p.status === "pending") ? (
                      <>
                        <Button size="icon" variant="ghost" className="size-8" aria-label="修正" onClick={() => setEditing(p.id)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="size-8 text-destructive" aria-label="削除" onClick={() => remove(p.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    ) : null}
                    <Button size="icon" variant="ghost" className="size-8" aria-label="1行コピー" onClick={() => copyRow(p)}>
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ),
          )}
          {footer}
        </tbody>
      </table>
    </div>
  );
}

function EditRow({
  p,
  cols,
  admin,
  onSave,
  onCancel,
}: {
  p: Purchase;
  cols: ColKey[];
  admin: boolean;
  onSave: (patch: Partial<Purchase>) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState({
    writer: p.writer,
    item_name: p.item_name,
    model: p.model ?? "",
    note: p.note ?? "",
    quantity: fmtNum(p.quantity),
    unit: p.unit ?? "",
    supplier: p.supplier ?? "",
    delivered_on: p.delivered_on ?? "",
    amount: p.amount == null ? "" : String(p.amount),
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const basic = ["writer", "item_name", "model", "note", "quantity", "unit"] as const;
  const adminOnly = ["supplier", "delivered_on", "amount"] as const;

  const save = () => {
    const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[,円\s]/g, "")));
    const patch: Partial<Purchase> = {
      writer: v.writer.trim(),
      item_name: v.item_name.trim(),
      model: v.model.trim() || null,
      note: v.note.trim() || null,
      quantity: num(v.quantity),
      unit: v.unit.trim() || null,
    };
    if (admin) {
      patch.supplier = v.supplier.trim() || null;
      patch.delivered_on = v.delivered_on || null;
      patch.amount = num(v.amount);
    }
    onSave(patch);
  };

  return (
    <tr className="bg-accent/30">
      {cols.map((k) => {
        const editable =
          (basic as readonly string[]).includes(k) || (admin && (adminOnly as readonly string[]).includes(k));
        return (
          <td key={k} className="border-b border-r border-border p-1 align-top">
            {editable ? (
              <Input
                className="h-9 min-w-0 px-1.5 text-sm"
                type={k === "delivered_on" ? "date" : "text"}
                inputMode={k === "quantity" || k === "amount" ? "decimal" : undefined}
                value={v[k as keyof typeof v]}
                onChange={set(k as keyof typeof v)}
                onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel(); }}
              />
            ) : (
              <span className="block px-1 py-2 text-muted-foreground">{COLS[k].text(p)}</span>
            )}
          </td>
        );
      })}
      <td className="border-b border-border p-1 whitespace-nowrap">
        <Button size="sm" className="h-8" onClick={save}>保存</Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={onCancel}>取消</Button>
      </td>
    </tr>
  );
}

/* ---------------- 記載者入力（ふりがな候補） ---------------- */

function WriterInput({
  value,
  onChange,
  writers,
  inputRef,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  writers: Writer[];
  inputRef?: React.Ref<HTMLInputElement>;
  onEnter?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const list = useMemo(() => matchWriters(writers, value), [writers, value]);
  const show = open && list.length > 0 && !(list.length === 1 && list[0]!.name === value);
  return (
    <div className="relative">
      <Input
        ref={inputRef}
        className="h-10 min-w-0 px-1.5 text-sm"
        placeholder="記載者"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (show) { onChange(list[0]!.name); setOpen(false); e.preventDefault(); }
            else onEnter?.();
          }
        }}
      />
      {show ? (
        <ul className="absolute bottom-full left-0 z-30 mb-1 max-h-60 w-44 overflow-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
          {list.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                className="flex w-full items-baseline gap-2 px-3 py-2.5 text-left hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(w.name); setOpen(false); }}
              >
                <span className="font-bold">{w.name}</span>
                <span className="text-xs text-muted-foreground">{w.kana}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ---------------- 記入（月次一覧） ---------------- */

const pad = (n: number) => String(n).padStart(2, "0");

function EntryView({ writers }: { writers: Writer[] }) {
  const { session } = useAuth();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [rows, setRows] = useState<Purchase[] | null>(null);
  // 記載者はこの記入画面を開いている間だけ引き継ぐ（画面を閉じると消える）
  const [writer, setWriter] = useState("");
  const blank = { item_name: "", model: "", note: "", quantity: "", unit: "" };
  const [draft, setDraft] = useState(blank);
  const [busy, setBusy] = useState(false);
  const itemRef = useRef<HTMLInputElement>(null);
  const writerRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const start = `${ym.y}-${pad(ym.m)}-01`;
    const end = ym.m === 12 ? `${ym.y + 1}-01-01` : `${ym.y}-${pad(ym.m + 1)}-01`;
    const { data } = await supabase
      .from("purchases")
      .select(SELECT)
      .is("deleted_at", null)
      .gte("written_on", start)
      .lt("written_on", end)
      .order("written_on")
      .order("created_at");
    setRows((data as Purchase[]) ?? []);
  }, [ym]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  const move = (d: number) => {
    const t = ym.m + d;
    setYm({ y: ym.y + Math.floor((t - 1) / 12), m: ((t - 1 + 1200) % 12) + 1 });
  };
  const isCurrent = ym.y === now.getFullYear() && ym.m === now.getMonth() + 1;

  const submit = async () => {
    if (!session) return;
    if (!writer.trim()) { toast.error("記載者を入力してください"); writerRef.current?.focus(); return; }
    if (!draft.item_name.trim()) { toast.error("品名を入力してください"); itemRef.current?.focus(); return; }
    setBusy(true);
    const q = draft.quantity.trim() === "" ? null : Number(draft.quantity);
    const { error } = await supabase.from("purchases").insert({
      user_id: session.user.id,
      writer: writer.trim(),
      item_name: draft.item_name.trim(),
      model: draft.model.trim() || null,
      note: draft.note.trim() || null,
      quantity: q != null && Number.isFinite(q) ? q : null,
      unit: draft.unit.trim() || null,
    });
    setBusy(false);
    if (error) { toast.error("依頼できませんでした"); return; }
    toast.success("購入依頼しました");
    setDraft(blank);
    if (!isCurrent) setYm({ y: now.getFullYear(), m: now.getMonth() + 1 });
    else void load();
    itemRef.current?.focus();
  };

  const d = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: e.target.value });
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter") void submit(); };
  const colCount = ENTRY_COLS.length + 1;

  const footer = (
    <tr className="bg-primary/5">
      <td className="border-r border-border px-2 text-xs text-muted-foreground">新規</td>
      <td className="border-r border-border p-1 min-w-24">
        <WriterInput value={writer} onChange={setWriter} writers={writers} inputRef={writerRef} onEnter={() => itemRef.current?.focus()} />
      </td>
      <td className="border-r border-border p-1"><Input ref={itemRef} className="h-10 min-w-0 px-1.5 text-sm" placeholder="品名" value={draft.item_name} onChange={d("item_name")} onKeyDown={enter} /></td>
      <td className="border-r border-border p-1"><Input className="h-10 min-w-0 px-1.5 text-sm" placeholder="型式" value={draft.model} onChange={d("model")} onKeyDown={enter} /></td>
      <td className="border-r border-border p-1"><Input className="h-10 min-w-0 px-1.5 text-sm" placeholder="備考" value={draft.note} onChange={d("note")} onKeyDown={enter} /></td>
      <td className="border-r border-border p-1"><Input className="h-10 min-w-0 px-1.5 text-right text-sm" inputMode="decimal" placeholder="数量" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value.replace(/[^\d.]/g, "") })} onKeyDown={enter} /></td>
      <td className="border-r border-border p-1"><Input className="h-10 min-w-0 px-1.5 text-sm" placeholder="単位" value={draft.unit} onChange={d("unit")} onKeyDown={enter} /></td>
      <td colSpan={colCount - 7} className="p-1">
        <Button className="h-10" disabled={busy} onClick={submit}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} 購入依頼
        </Button>
      </td>
    </tr>
  );

  return (
    <main className="mx-auto max-w-[1400px] px-3 pb-24 pt-3">
      <div className="mb-2 flex items-center gap-2">
        <Button variant="outline" size="icon" className="bg-card" aria-label="前の月" onClick={() => move(-1)}><ChevronLeft className="size-5" /></Button>
        <h2 className="min-w-40 text-center text-lg font-bold">{ym.y}年{ym.m}月 物品購入</h2>
        <Button variant="outline" size="icon" className="bg-card" aria-label="次の月" onClick={() => move(1)}><ChevronRight className="size-5" /></Button>
        {!isCurrent ? <Button variant="ghost" size="sm" onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() + 1 })}>今月</Button> : null}
      </div>
      {rows === null ? (
        <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <PurchaseTable rows={rows} cols={ENTRY_COLS} reload={load} footer={footer} />
          {rows.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">この月の依頼はまだありません。一番下の行に入力してください。</p> : null}
          <p className="mt-2 text-xs text-muted-foreground">各項目をタップするとコピーできます。</p>
        </>
      )}
    </main>
  );
}

/* ---------------- 履歴 ---------------- */

function HistoryView() {
  const [rows, setRows] = useState<Purchase[] | null>(null);
  const [f, setF] = useState({ workplace: "", writer: "", item: "", model: "", supplier: "", from: "", to: "", status: "" });
  const [sort, setSort] = useState<{ key: ColKey; dir: 1 | -1 }>({ key: "written_on", dir: -1 });

  const load = useCallback(async () => {
    const { data } = await supabase.from("purchases").select(SELECT).is("deleted_at", null).order("written_on", { ascending: false }).limit(5000);
    setRows((data as Purchase[]) ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const workplaces = useMemo(() => [...new Set((rows ?? []).map((r) => r.workplace).filter(Boolean))] as string[], [rows]);

  const view = useMemo(() => {
    if (!rows) return [];
    const has = (s: string | null, q: string) => !q || (s ?? "").toLowerCase().includes(q.toLowerCase());
    const out = rows.filter(
      (r) =>
        (!f.workplace || r.workplace === f.workplace) &&
        has(r.writer, f.writer) && has(r.item_name, f.item) && has(r.model, f.model) && has(r.supplier, f.supplier) &&
        (!f.from || r.written_on >= f.from) && (!f.to || r.written_on <= f.to) &&
        (!f.status || r.status === f.status),
    );
    const val = (r: Purchase): string | number => {
      switch (sort.key) {
        case "quantity": return r.quantity ?? -Infinity;
        case "amount": return r.amount ?? -Infinity;
        case "lead": return leadDays(r) ?? -Infinity;
        case "written_on": return r.written_on + r.created_at;
        case "delivered_on": return r.delivered_on ?? "";
        default: return COLS[sort.key].text(r);
      }
    };
    return [...out].sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ja");
      return c * sort.dir;
    });
  }, [rows, f, sort]);

  const onSort = (k: ColKey) => setSort((s) => (s.key === k ? { key: k, dir: (s.dir * -1) as 1 | -1 } : { key: k, dir: 1 }));
  const inp = (k: keyof typeof f, ph: string) => (
    <Input className="h-10 text-sm" placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
  );
  const total = view.reduce((s, r) => s + (r.amount ?? 0), 0);
  const selectCls = "h-10 rounded-md border border-input bg-background px-2 text-sm";

  return (
    <main className="mx-auto max-w-[1400px] px-3 pb-24 pt-3">
      <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-4 lg:grid-cols-8">
        <select className={selectCls} value={f.workplace} onChange={(e) => setF({ ...f, workplace: e.target.value })} aria-label="職場">
          <option value="">職場：すべて</option>
          {workplaces.map((w) => <option key={w} value={w}>{w}</option>)}
        </select>
        {inp("writer", "記載者")}
        {inp("item", "品名")}
        {inp("model", "型式")}
        {inp("supplier", "発注先")}
        <Input className="h-10 text-sm" type="date" aria-label="期間（開始）" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <Input className="h-10 text-sm" type="date" aria-label="期間（終了）" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        <select className={selectCls} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="状態">
          <option value="">状態：すべて</option>
          {(Object.keys(STATUS) as PurchaseStatus[]).map((s) => <option key={s} value={s}>{statusText(s)}</option>)}
        </select>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
        <span>{view.length}件</span>
        <span className="text-muted-foreground">金額合計 {fmtYen(total)}</span>
        {Object.values(f).some(Boolean) ? (
          <Button size="sm" variant="ghost" onClick={() => setF({ workplace: "", writer: "", item: "", model: "", supplier: "", from: "", to: "", status: "" })}>条件をクリア</Button>
        ) : null}
      </div>
      {rows === null ? (
        <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-primary" /></div>
      ) : (
        <HistoryTable rows={view} load={load} sort={sort} onSort={onSort} />
      )}
    </main>
  );
}

function HistoryTable({ rows, load, sort, onSort }: { rows: Purchase[]; load: () => void; sort: { key: ColKey; dir: 1 | -1 }; onSort: (k: ColKey) => void }) {
  return <PurchaseTable rows={rows} cols={HISTORY_COLS} reload={load} sort={sort} onSort={onSort} fullDate />;
}
