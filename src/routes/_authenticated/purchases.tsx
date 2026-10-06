import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  Loader2,
  Pencil,
  Search,
  Send,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { AnalyticsLink, SupplierMaster, WriterMaster, type Supplier } from "@/components/AdminSettings";
import { AttachPicker, PendingThumbs, RowAttachments, SupplierInput, saveAttachments, type Attachment, type PendingAttach } from "@/components/PurchaseExtras";
import { InspectionView } from "@/components/InspectionView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  searchWords,
  statusText,
  subtotal,
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

const SELECT =
  "id,user_id,workplace,written_on,writer,item_name,model,note,quantity,unit,status,supplier,delivered_on,amount,check_reason,created_at";

type ColKey =
  | "written_on" | "workplace" | "writer" | "item_name" | "model" | "note" | "quantity" | "unit"
  | "status" | "lead" | "delivered_on" | "amount" | "subtotal" | "supplier" | "estimate" | "ops";

type Col = { label: string; w: string; text: (p: Purchase, full?: boolean) => string; align?: "right" };

const COLS: Record<ColKey, Col> = {
  written_on: { label: "記載日", w: "w-16", text: (p, f) => (f ? fmtYMD(p.written_on) : fmtMD(p.written_on)) },
  workplace: { label: "職場", w: "w-24", text: (p) => p.workplace ?? "" },
  writer: { label: "記載者", w: "w-24", text: (p) => p.writer },
  item_name: { label: "品名", w: "w-36", text: (p) => p.item_name },
  model: { label: "型式", w: "w-32", text: (p) => p.model ?? "" },
  note: { label: "備考", w: "w-32", text: (p) => p.note ?? "" },
  quantity: { label: "数量", w: "w-16", text: (p) => fmtNum(p.quantity), align: "right" },
  unit: { label: "単位", w: "w-14", text: (p) => p.unit ?? "" },
  status: { label: "状態", w: "w-24", text: (p) => statusText(p.status) },
  lead: {
    label: "目安納期",
    w: "w-20",
    text: (p) => {
      const d = leadDays(p);
      return d == null ? "" : d > 0 ? `${d}日` : "-";
    },
    align: "right",
  },
  delivered_on: { label: "納品日", w: "w-32", text: (p, f) => (f ? fmtYMD(p.delivered_on) : fmtMD(p.delivered_on)) },
  amount: { label: "単価", w: "w-28", text: (p) => fmtYen(p.amount), align: "right" },
  subtotal: { label: "小計", w: "w-24", text: (p) => fmtYen(subtotal(p)), align: "right" },
  supplier: { label: "発注先", w: "w-36", text: (p) => p.supplier ?? "" },
  estimate: { label: "見積書", w: "w-14", text: () => "" },
  ops: { label: "操作", w: "", text: () => "" },
};

/** ワンクリックコピー・一括コピーの対象（6項目） */
const COPY_KEYS = ["writer", "item_name", "model", "note", "quantity", "unit"] as const;
type CopyKey = (typeof COPY_KEYS)[number];
type Clip = Record<CopyKey, string>;
const COPYABLE = new Set<ColKey>(COPY_KEYS);
/** 管理者が一覧上で直接入力できる項目 */
const ADMIN_INLINE = new Set<ColKey>(["delivered_on", "amount", "supplier"]);

/** 列順：状態→記載者→品名→型式→備考→数量→単位→見積書(管理者)→操作→発注先→目安納期→納品日→単価→小計 */
const BASIC: ColKey[] = ["status", "writer", "item_name", "model", "note", "quantity", "unit"];
const TAIL: ColKey[] = ["supplier", "lead", "delivered_on", "amount", "subtotal"];
const midCols = (admin: boolean): ColKey[] => (admin ? ["estimate", "ops"] : ["ops"]);

const googleSearch = (q: string) =>
  window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, "_blank", "noopener,noreferrer");

const clipFrom = (p: Purchase): Clip => ({
  writer: p.writer ?? "",
  item_name: p.item_name ?? "",
  model: p.model ?? "",
  note: p.note ?? "",
  quantity: fmtNum(p.quantity),
  unit: p.unit ?? "",
});

function PurchasesPage() {
  const { isAdmin, can } = useAuth();
  const allTabs = [
    ...(can("purchases.entry") ? (["entry"] as const) : []),
    ...(can("purchases.history") ? (["history"] as const) : []),
    ...(isAdmin ? (["inspection"] as const) : []),
    ...(can("settings.writers") || can("settings.suppliers") || can("settings.analytics") ? (["settings"] as const) : []),
  ];
  const [tab, setTab] = useState<"entry" | "history" | "inspection" | "settings">(allTabs[0] ?? "entry");
  const [writers, setWriters] = useState<Writer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const loadSuppliers = useCallback(() => {
    if (!isAdmin) return;
    void supabase.from("purchase_suppliers").select("id,name,vendor_no").order("name").then(({ data }) => setSuppliers((data as Supplier[]) ?? []));
  }, [isAdmin]);
  useEffect(() => loadSuppliers(), [loadSuppliers]);
  // 一括コピー（アプリ内専用。記入・履歴の間で共有）
  const [clip, setClip] = useState<Clip | null>(null);
  const [pendingPaste, setPendingPaste] = useState<Clip | null>(null);

  const loadWriters = useCallback(() => {
    void supabase
      .from("purchase_writers")
      .select("id,name,kana")
      .order("kana")
      .then(({ data }) => setWriters((data as Writer[]) ?? []));
  }, []);
  useEffect(() => loadWriters(), [loadWriters]);

  const bulkCopy = (p: Purchase) => {
    setClip(clipFrom(p));
    toast.success("一括コピーしました（一括ペーストで記入欄へ入ります）", { duration: 1500 });
  };

  const tabs = allTabs;
  const tabLabel = { entry: "記入", history: "履歴", inspection: "発注検収", settings: "設定" };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="物品購入" />
      <div className="mx-auto max-w-[1500px] px-3 pt-3">
        <div className="inline-flex rounded-xl border border-border bg-card p-1">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                if (t === "settings") loadWriters();
                else loadSuppliers();
                setTab(t);
              }}
              className={`rounded-lg px-5 py-2 text-sm font-bold ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {tabLabel[t]}
            </button>
          ))}
        </div>
      </div>
      {tabs.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">利用できる機能がありません。管理者にお問い合わせください。</p>
      ) : !tabs.includes(tab as never) ? null : tab === "entry" ? (
        <EntryView
          writers={writers}
          suppliers={suppliers}
          clip={clip}
          onBulkCopy={bulkCopy}
          initialPaste={pendingPaste}
          onConsumePaste={() => setPendingPaste(null)}
        />
      ) : tab === "history" ? (
        <HistoryView
          suppliers={suppliers}
          clip={clip}
          onBulkCopy={bulkCopy}
          onPaste={() => {
            if (!clip) return;
            setPendingPaste(clip);
            setTab("entry");
          }}
        />
      ) : tab === "inspection" && isAdmin ? (
        <InspectionView suppliers={suppliers} />
      ) : tab === "settings" ? (
        <main className="mx-auto max-w-md space-y-6 px-4 pb-24 pt-5">
          {can("settings.writers") ? <WriterMaster /> : null}
          {can("settings.suppliers") ? <SupplierMaster /> : null}
          {can("settings.analytics") ? <AnalyticsLink /> : null}
        </main>
      ) : null}
    </div>
  );
}

/* ---------------- 共通: 一覧テーブル ---------------- */

function PurchaseTable({
  rows,
  cols,
  footer,
  reload,
  sort,
  onSort,
  fullDate,
  onBulkCopy,
  suppliers,
}: {
  suppliers: Supplier[];
  rows: Purchase[];
  cols: ColKey[];
  footer?: React.ReactNode;
  reload: () => void;
  sort?: { key: ColKey; dir: 1 | -1 };
  onSort?: (k: ColKey) => void;
  fullDate?: boolean;
  onBulkCopy: (p: Purchase) => void;
}) {
  const { isAdmin, session } = useAuth();
  const [editing, setEditing] = useState<string | null>(null);
  const [estimates, setEstimates] = useState<Record<string, string>>({});
  const [atts, setAtts] = useState<Record<string, Attachment[]>>({});
  const idsKey = rows.map((r) => r.id).join(",");
  const loadExtras = useCallback(async () => {
    const ids = rows.map((r) => r.id);
    if (!ids.length) { setAtts({}); setEstimates({}); return; }
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
    const a: Record<string, Attachment[]> = {};
    const e: Record<string, string> = {};
    await Promise.all(chunks.map(async (c) => {
      const [{ data: at }, adm] = await Promise.all([
        supabase.from("purchase_attachments").select("id,purchase_id,storage_path,photo_id").in("purchase_id", c).is("deleted_at", null).order("created_at"),
        isAdmin ? supabase.from("purchase_admin_fields").select("purchase_id,estimate_no").in("purchase_id", c) : Promise.resolve({ data: [] as { purchase_id: string; estimate_no: string | null }[] }),
      ]);
      (at ?? []).forEach((x) => { (a[x.purchase_id] ??= []).push(x as Attachment); });
      (adm.data ?? []).forEach((x) => { if (x.estimate_no) e[x.purchase_id] = x.estimate_no; });
    }));
    setAtts(a);
    setEstimates(e);
  }, [idsKey, isAdmin]);
  useEffect(() => { void loadExtras(); }, [loadExtras]);
  const saveEstimate = async (id: string, v: string) => {
    const { error } = await supabase.from("purchase_admin_fields").upsert({ purchase_id: id, estimate_no: v || null, updated_at: new Date().toISOString() });
    if (error) { toast.error("保存に失敗しました"); return; }
    setEstimates((m) => ({ ...m, [id]: v }));
  };

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
  const markChecked = async (id: string) => {
    const { error } = await supabase.rpc("mark_purchase_checked", { _id: id });
    if (error) toast.error("更新に失敗しました");
    else toast.success("確認済にしました");
    reload();
  };

  const copyCell = async (t: string) => {
    if (!t) return;
    if (await copyText(t)) toast.success(`コピー: ${t}`, { duration: 1200 });
  };
  const copyRowTsv = async (p: Purchase) => {
    const c = clipFrom(p);
    if (await copyText(toTsv(COPY_KEYS.map((k) => c[k])))) toast.success("Excel用に1行コピーしました", { duration: 1200 });
  };

  const ops = (p: Purchase) => (
                  <div className="flex items-center gap-1">
                    {isAdmin ? (
                      <>
                        <Button
                          size="sm"
                          variant={p.status === "approved" ? "default" : "outline"}
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
                        <NeedsCheckButton p={p} onSave={(reason) => update(p.id, { status: "needs_check", check_reason: reason })} />
                      </>
                    ) : null}
                    {p.status === "needs_check" ? (
                      <Button size="sm" className="h-8 px-2" onClick={() => markChecked(p.id)}>
                        ✅ 確認済
                      </Button>
                    ) : null}
                    {isAdmin || (p.user_id === session?.user.id && p.status === "pending") ? (
                      <>
                        <Button size="icon" variant="ghost" className="size-8" aria-label="修正" title="修正" onClick={() => setEditing(p.id)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="size-8 text-destructive" aria-label="削除" title="削除" onClick={() => remove(p.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    ) : null}
                    <Button size="sm" variant="outline" className="h-8 bg-card px-2 text-xs" title="アプリ内の一括コピー（一括ペーストで記入欄へ入ります）" onClick={() => onBulkCopy(p)}>
                      <ClipboardCopy className="size-4" /> 一括コピー
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      aria-label="Web検索"
                      title={`Web検索：${searchWords(p)}`}
                      disabled={!searchWords(p)}
                      onClick={() => googleSearch(searchWords(p))}
                    >
                      <Search className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="size-8" aria-label="Excel用に行コピー" title="Excel用に行コピー" onClick={() => copyRowTsv(p)}>
                      <Copy className="size-4" />
                    </Button>
                  </div>
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-max min-w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-secondary text-secondary-foreground">
          <tr>
            {cols.map((k) => (
              <th key={k} className={`${COLS[k].w} ${k === "estimate" || k === "ops" ? "bg-primary/10" : ""} border-b border-r border-border px-2 py-2 text-left text-xs font-bold whitespace-nowrap`}>
                {onSort && k !== "ops" && k !== "estimate" ? (
                  <button type="button" className="inline-flex items-center gap-0.5" onClick={() => onSort(k)}>
                    {COLS[k].label}
                    {sort?.key === k ? sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
                  </button>
                ) : (
                  COLS[k].label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) =>
            editing === p.id ? (
              <EditRow
                key={p.id}
                p={p}
                cols={cols}
                fullDate={!!fullDate}
                onCancel={() => setEditing(null)}
                onSave={async (patch) => {
                  if (await update(p.id, patch)) {
                    setEditing(null);
                    toast.success("修正しました");
                  }
                }}
              />
            ) : (
              <tr key={p.id} className={p.status === "rejected" ? "text-muted-foreground" : ""}>
                {cols.map((k) => {
                  const t = COLS[k].text(p, fullDate);
                  const strike = p.status === "rejected" && k !== "status" ? "line-through" : "";
                  const right = COLS[k].align === "right" ? "text-right" : "";
                  if (k === "ops") return <td key={k} className="border-b border-r border-border px-1 py-1 align-top whitespace-nowrap">{ops(p)}</td>;
                  if (k === "estimate") {
                    return (
                      <td key={k} className="border-b border-r border-border p-1 align-top">
                        <EstimateCell value={estimates[p.id] ?? ""} onSave={(v) => saveEstimate(p.id, v)} />
                      </td>
                    );
                  }
                  if (k === "note") {
                    const mine = p.user_id === session?.user.id;
                    return (
                      <td key={k} className={`border-b border-r border-border px-1 py-1 align-top ${strike}`}>
                        <div className="flex items-start gap-0.5">
                          <span
                            title={t ? "クリックでコピー" : undefined}
                            onClick={() => copyCell(t)}
                            className="min-h-8 flex-1 cursor-copy whitespace-pre-wrap break-words rounded px-1 py-1 hover:bg-accent/40"
                          >
                            {t}
                          </span>
                          <RowAttachments
                            purchaseId={p.id}
                            items={atts[p.id] ?? []}
                            canAdd={isAdmin || (mine && p.status === "pending")}
                            canRemove={isAdmin}
                            uid={session?.user.id ?? ""}
                            onChanged={() => void loadExtras()}
                          />
                        </div>
                      </td>
                    );
                  }
                  if (isAdmin && ADMIN_INLINE.has(k)) {
                    return (
                      <td key={k} className="border-b border-r border-border p-1 align-top">
                        <InlineAdminCell p={p} k={k as "delivered_on" | "amount" | "supplier"} suppliers={suppliers} onSave={(patch) => update(p.id, patch)} />
                      </td>
                    );
                  }
                  if (k === "status") {
                    return (
                      <td key={k} className="border-b border-r border-border px-2 py-2 align-top whitespace-nowrap">
                        <StatusCell p={p} />
                      </td>
                    );
                  }
                  if (COPYABLE.has(k)) {
                    return (
                      <td
                        key={k}
                        title={t ? "クリックでコピー" : undefined}
                        onClick={() => copyCell(t)}
                        className={`cursor-copy border-b border-r border-border px-2 py-2 align-top whitespace-pre-wrap break-words hover:bg-accent/40 ${right} ${strike}`}
                      >
                        {t}
                      </td>
                    );
                  }
                  return (
                    <td key={k} className={`border-b border-r border-border px-2 py-2 align-top whitespace-nowrap ${right} ${strike}`}>
                      {t}
                    </td>
                  );
                })}
              </tr>
            ),
          )}
          {footer}
        </tbody>
      </table>
    </div>
  );
}

function StatusCell({ p }: { p: Purchase }) {
  const label = statusText(p.status);
  if (!p.check_reason || (p.status !== "needs_check" && p.status !== "checked")) return <span>{label}</span>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="underline decoration-dotted underline-offset-4" title="要確認理由を表示">
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="text-xs font-bold text-muted-foreground">【要確認理由】</div>
        <p className="mt-1 whitespace-pre-wrap text-sm">{p.check_reason}</p>
      </PopoverContent>
    </Popover>
  );
}

function NeedsCheckButton({ p, onSave }: { p: Purchase; onSave: (reason: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(p.check_reason ?? "");
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setReason(p.check_reason ?? ""); }}>
      <PopoverTrigger asChild>
        <Button size="sm" variant={p.status === "needs_check" ? "default" : "outline"} className="h-8 px-2" disabled={p.status === "delivered"}>
          <TriangleAlert className="size-4" /> 要確認
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="text-sm font-bold">【要確認理由】</div>
        <Textarea
          className="mt-2 min-h-24"
          placeholder="例：型式を再確認してください"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
        <div className="mt-2 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>取消</Button>
          <Button
            size="sm"
            onClick={async () => {
              if (await onSave(reason.trim())) {
                setOpen(false);
                toast.success("要確認にしました");
              }
            }}
          >
            要確認にする
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 管理者専用：納品日・単価・発注先を一覧上で直接入力 */
function InlineAdminCell({
  p,
  k,
  onSave,
  suppliers,
}: {
  suppliers: Supplier[];
  p: Purchase;
  k: "delivered_on" | "amount" | "supplier";
  onSave: (patch: Partial<Purchase>) => Promise<boolean>;
}) {
  const initial = k === "amount" ? (p.amount == null ? "" : String(Number(p.amount))) : (p[k] ?? "");
  const [v, setV] = useState(initial);
  useEffect(() => setV(initial), [initial]);
  const commit = (val: string) => {
    if (val === initial) return;
    if (k === "amount") {
      const t = val.replace(/[,円\s]/g, "");
      const n = t === "" ? null : Number(t);
      if (n != null && !Number.isFinite(n)) { setV(initial); return; }
      void onSave({ amount: n });
    } else if (k === "delivered_on") {
      void onSave({ delivered_on: val || null });
    } else {
      void onSave({ supplier: val.trim() || null });
    }
  };
  if (k === "supplier") {
    return <SupplierInput value={v} onChange={setV} onCommit={commit} suppliers={suppliers} />;
  }
  return (
    <Input
      className={`h-9 min-w-0 px-1.5 text-sm ${k === "amount" ? "text-right" : ""}`}
      type={k === "delivered_on" ? "date" : "text"}
      inputMode={k === "amount" ? "decimal" : undefined}
      placeholder={k === "amount" ? "単価" : undefined}
      aria-label={COLS[k].label}
      value={v}
      onChange={(e) => {
        setV(e.target.value);
        if (k === "delivered_on") commit(e.target.value);
      }}
      onBlur={() => k !== "delivered_on" && commit(v)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setV(initial);
      }}
    />
  );
}

/** 見積書（3桁までの数字、管理者のみ） */
function EstimateCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Input
      className="h-9 w-12 min-w-0 px-1 text-center text-sm"
      inputMode="numeric"
      maxLength={3}
      aria-label="見積書"
      value={v}
      onChange={(e) => setV(e.target.value.replace(/\D/g, "").slice(0, 3))}
      onBlur={() => v !== value && onSave(v)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

/** 修正（基本項目のみ。管理者項目は一覧上で直接入力） */
function EditRow({
  p,
  cols,
  fullDate,
  onSave,
  onCancel,
}: {
  p: Purchase;
  cols: ColKey[];
  fullDate?: boolean;
  onSave: (patch: Partial<Purchase>) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<Clip>(clipFrom(p));
  const save = () => {
    const q = v.quantity.trim() === "" ? null : Number(v.quantity.replace(/[,\s]/g, ""));
    onSave({
      writer: v.writer.trim(),
      item_name: v.item_name.trim(),
      model: v.model.trim() || null,
      note: v.note.trim() || null,
      quantity: q != null && Number.isFinite(q) ? q : null,
      unit: v.unit.trim() || null,
    });
  };
  return (
    <tr className="bg-accent/30">
      {cols.map((k) => (
        <td key={k} className="border-b border-r border-border p-1 align-top">
          {k === "ops" ? (
            <div className="whitespace-nowrap">
              <Button size="sm" className="h-8" onClick={save}>保存</Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={onCancel}>取消</Button>
            </div>
          ) : COPYABLE.has(k) ? (
            <Input
              className="h-9 min-w-0 px-1.5 text-sm"
              inputMode={k === "quantity" ? "decimal" : undefined}
              value={v[k as CopyKey]}
              onChange={(e) => setV({ ...v, [k]: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") onCancel();
              }}
            />
          ) : (
            <span className="block px-1 py-2 text-muted-foreground whitespace-nowrap">{COLS[k].text(p, fullDate)}</span>
          )}
        </td>
      ))}
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
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (show) {
              onChange(list[0]!.name);
              setOpen(false);
              e.preventDefault();
            } else onEnter?.();
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
                onClick={() => {
                  onChange(w.name);
                  setOpen(false);
                }}
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

function EntryView({
  writers,
  suppliers,
  clip,
  onBulkCopy,
  initialPaste,
  onConsumePaste,
}: {
  writers: Writer[];
  suppliers: Supplier[];
  clip: Clip | null;
  onBulkCopy: (p: Purchase) => void;
  initialPaste: Clip | null;
  onConsumePaste: () => void;
}) {
  const { session, isAdmin } = useAuth();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [rows, setRows] = useState<Purchase[] | null>(null);
  // 記載者はこの記入画面を開いている間だけ引き継ぐ（画面を閉じると消える）
  const [writer, setWriter] = useState(initialPaste?.writer ?? "");
  const blank = { item_name: "", model: "", note: "", quantity: "", unit: "" };
  const [draft, setDraft] = useState(
    initialPaste
      ? { item_name: initialPaste.item_name, model: initialPaste.model, note: initialPaste.note, quantity: initialPaste.quantity, unit: initialPaste.unit }
      : blank,
  );
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAttach[]>([]);
  const [q, setQ] = useState("");
  const itemRef = useRef<HTMLInputElement>(null);
  const writerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialPaste) onConsumePaste();
  }, []);

  // 一般：発注先まで表示（変更不可）。管理者：全列
  const cols: ColKey[] = isAdmin ? ["written_on", ...BASIC, ...midCols(true), ...TAIL] : ["written_on", ...BASIC, "ops", "supplier"];

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

  const paste = () => {
    if (!clip) return;
    setWriter(clip.writer);
    setDraft({ item_name: clip.item_name, model: clip.model, note: clip.note, quantity: clip.quantity, unit: clip.unit });
  };

  const submit = async () => {
    if (!session) return;
    if (!writer.trim()) {
      toast.error("記載者を入力してください");
      writerRef.current?.focus();
      return;
    }
    if (!draft.item_name.trim()) {
      toast.error("品名を入力してください");
      itemRef.current?.focus();
      return;
    }
    setBusy(true);
    const q = draft.quantity.trim() === "" ? null : Number(draft.quantity);
    const { data: ins, error } = await supabase.from("purchases").insert({
      user_id: session.user.id,
      writer: writer.trim(),
      item_name: draft.item_name.trim(),
      model: draft.model.trim() || null,
      note: draft.note.trim() || null,
      quantity: q != null && Number.isFinite(q) ? q : null,
      unit: draft.unit.trim() || null,
    }).select("id").single();
    if (error || !ins) {
      setBusy(false);
      toast.error("依頼できませんでした");
      return;
    }
    if (pending.length) await saveAttachments(ins.id, session.user.id, pending);
    setPending([]);
    setBusy(false);
    toast.success("購入依頼しました");
    setDraft(blank);
    if (!isCurrent) setYm({ y: now.getFullYear(), m: now.getMonth() + 1 });
    else void load();
    itemRef.current?.focus();
  };

  const d = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: e.target.value });
  const enter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") void submit();
  };
  const words = searchWords(draft);

  const footer = (
    <tr className="bg-primary/5">
      <td className="border-r border-border px-2 text-xs text-muted-foreground">新規</td>
      <td className="border-r border-border" />
      <td className="min-w-24 border-r border-border p-1">
        <WriterInput value={writer} onChange={setWriter} writers={writers} inputRef={writerRef} onEnter={() => itemRef.current?.focus()} />
      </td>
      <td className="border-r border-border p-1"><Input ref={itemRef} className="h-10 min-w-0 px-1.5 text-sm" placeholder="品名" value={draft.item_name} onChange={d("item_name")} onKeyDown={enter} /></td>
      <td className="border-r border-border p-1"><Input className="h-10 min-w-0 px-1.5 text-sm" placeholder="型式" value={draft.model} onChange={d("model")} onKeyDown={enter} /></td>
      <td className="border-r border-border p-1">
        <div className="flex items-center gap-0.5">
          <Input className="h-10 min-w-0 px-1.5 text-sm" placeholder="備考" value={draft.note} onChange={d("note")} onKeyDown={enter} />
          <AttachPicker count={pending.length} onPick={(items) => setPending((x) => [...x, ...items])} />
        </div>
        <PendingThumbs items={pending} onRemove={(k) => setPending((x) => x.filter((i) => i.key !== k))} />
      </td>
      <td className="border-r border-border p-1"><Input className="h-10 min-w-0 px-1.5 text-right text-sm" inputMode="decimal" placeholder="数量" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value.replace(/[^\d.]/g, "") })} onKeyDown={enter} /></td>
      <td className="border-r border-border p-1"><Input className="h-10 min-w-0 px-1.5 text-sm" placeholder="単位" value={draft.unit} onChange={d("unit")} onKeyDown={enter} /></td>
      <td colSpan={cols.length - 8} className="p-1">
        <div className="flex items-center gap-1">
          <Button className="h-10" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} 購入依頼
          </Button>
          <Button variant="outline" className="h-10 bg-card px-2 text-xs" title="一括コピーした内容を記入欄へ入れます" onClick={paste}>
            <ClipboardPaste className="size-4" /> 一括ペースト
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-10"
            aria-label="Web検索"
            title={words ? `Web検索：${words}` : "品名か型式を入力すると検索できます"}
            disabled={!words}
            onClick={() => googleSearch(words)}
          >
            <Search className="size-4" />
          </Button>
        </div>
      </td>
    </tr>
  );

  return (
    <main className="mx-auto max-w-[1500px] px-3 pb-24 pt-3">
      <div className="mb-2 flex items-center gap-2">
        <Button variant="outline" size="icon" className="bg-card" aria-label="前の月" onClick={() => move(-1)}><ChevronLeft className="size-5" /></Button>
        <h2 className="min-w-40 text-center text-lg font-bold">{ym.y}年{ym.m}月 物品購入</h2>
        <Button variant="outline" size="icon" className="bg-card" aria-label="次の月" onClick={() => move(1)}><ChevronRight className="size-5" /></Button>
        {!isCurrent ? <Button variant="ghost" size="sm" onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() + 1 })}>今月</Button> : null}
        <form
          className="ml-auto flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) googleSearch(q.trim());
          }}
        >
          <Input className="h-9 w-40 bg-card text-sm sm:w-56" placeholder="Google検索" aria-label="Google検索" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button type="submit" size="icon" variant="outline" className="size-9 bg-card" aria-label="検索" disabled={!q.trim()}><Search className="size-4" /></Button>
        </form>
      </div>
      {rows === null ? (
        <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <PurchaseTable rows={rows} cols={cols} reload={load} footer={footer} onBulkCopy={onBulkCopy} suppliers={suppliers} />
          {rows.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">この月の依頼はまだありません。一番下の行に入力してください。</p> : null}
          <p className="mt-2 text-xs text-muted-foreground">記載者・品名・型式・備考・数量・単位はタップするとコピーできます。</p>
        </>
      )}
    </main>
  );
}

/* ---------------- 履歴 ---------------- */

function HistoryView({ suppliers, clip, onBulkCopy, onPaste }: { suppliers: Supplier[]; clip: Clip | null; onBulkCopy: (p: Purchase) => void; onPaste: () => void }) {
  const { isAdmin } = useAuth();
  const HISTORY_COLS: ColKey[] = ["written_on", "workplace", ...BASIC, ...midCols(isAdmin), ...TAIL];
  const [rows, setRows] = useState<Purchase[] | null>(null);
  const empty = { workplace: "", writer: "", item: "", model: "", supplier: "", from: "", to: "", status: "" };
  const [f, setF] = useState(empty);
  // 記入画面と同じく古いものが上
  const [sort, setSort] = useState<{ key: ColKey; dir: 1 | -1 }>({ key: "written_on", dir: 1 });

  const load = useCallback(async () => {
    const { data } = await supabase.from("purchases").select(SELECT).is("deleted_at", null).order("written_on").order("created_at").limit(5000);
    setRows((data as Purchase[]) ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

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
        case "subtotal": return subtotal(r) ?? -Infinity;
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
  const selectCls = "h-10 rounded-md border border-input bg-background px-2 text-sm";

  return (
    <main className="mx-auto max-w-[1500px] px-3 pb-24 pt-3">
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
        {Object.values(f).some(Boolean) ? (
          <Button size="sm" variant="ghost" onClick={() => setF(empty)}>条件をクリア</Button>
        ) : null}
        <Button size="sm" variant="outline" className="ml-auto bg-card" disabled={!clip} title="一括コピーした内容を記入画面の入力欄へ入れます" onClick={onPaste}>
          <ClipboardPaste className="size-4" /> 一括ペースト（記入へ）
        </Button>
      </div>
      {rows === null ? (
        <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-primary" /></div>
      ) : (
        <PurchaseTable rows={view} cols={HISTORY_COLS} reload={load} sort={sort} onSort={onSort} fullDate onBulkCopy={onBulkCopy} suppliers={suppliers} />
      )}
    </main>
  );
}
