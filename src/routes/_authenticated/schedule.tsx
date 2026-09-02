import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileDown, FileUp, Loader2, Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportCsv, exportPdf, exportScheduleExcel, parseScheduleExcel, IMPORT_FILE_NAME } from "@/lib/exporters";
import type { ImportedRow } from "@/lib/exporters";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/schedule")({
  head: () => ({
    meta: [
      { title: "スケジュール | 三条工場 業務管理" },
      { name: "description", content: "日付ごとの申し送りを一覧で確認し、Excel・CSV・PDFへ出力します。" },
      { property: "og:title", content: "スケジュール | 三条工場 業務管理" },
      { property: "og:description", content: "日付ごとの申し送りを一覧で確認し、Excel・CSV・PDFへ出力します。" },
    ],
  }),
  component: SchedulePage,
});

type Schedule = {
  id: string;
  user_id: string;
  entry_date: string;
  size: string | null;
  comment_category: string | null;
  operation_comment: string | null;
  repair_item: string | null;
  new_effort: string | null;
  quality: string | null;
  personal_plan: string | null;
};

type FieldKey = "size" | "comment_category" | "operation_comment" | "repair_item" | "new_effort" | "personal_plan";

const COLUMNS: { key: FieldKey; label: string; width: string; multiline?: boolean }[] = [
  { key: "size", label: "サイズ", width: "min-w-24" },
  { key: "comment_category", label: "コメント分類", width: "min-w-28" },
  { key: "operation_comment", label: "操業コメント", width: "min-w-56", multiline: true },
  { key: "repair_item", label: "修理項目", width: "min-w-40", multiline: true },
  { key: "new_effort", label: "その他予定", width: "min-w-40", multiline: true },
  { key: "personal_plan", label: "個人予定", width: "min-w-40", multiline: true },
];

const DAY_OPTIONS = Array.from({ length: 14 }, (_, i) => `${((i + 1) / 10).toFixed(1)}日`);

const pad = (n: number) => String(n).padStart(2, "0");
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

function daysOfMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  const last = new Date(y!, m!, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${key}-${pad(i + 1)}`);
}

/** コメント分類文字列を「日数」と「連操」に分解 */
function parseCategory(v: string | null | undefined) {
  const s = (v ?? "").trim();
  const day = DAY_OPTIONS.find((d) => s.includes(d)) ?? "";
  return { day, renso: /連操/.test(s) };
}
const buildCategory = (day: string, renso: boolean) => [day, renso ? "連操" : ""].filter(Boolean).join("　");

function SchedulePage() {
  const { session } = useAuth();
  const [rows, setRows] = useState<Schedule[] | null>(null);
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [monthPicker, setMonthPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cell, setCell] = useState<{ date: string; key: FieldKey; value: string } | null>(null);
  const [query, setQuery] = useState("");
  const [hitIndex, setHitIndex] = useState(-1);
  const [importRows, setImportRows] = useState<ImportedRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("schedules")
      .select("*")
      .is("deleted_at", null)
      .order("entry_date", { ascending: false });
    if (error) toast.error("読み込みに失敗しました");
    setRows((data as Schedule[]) ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const byDate = useMemo(() => {
    const map: Record<string, Schedule> = {};
    (rows ?? []).forEach((r) => {
      if (!map[r.entry_date]) map[r.entry_date] = r;
    });
    return map;
  }, [rows]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    setMonth(monthKey(new Date(y!, m! - 1 + delta, 1)));
  };

  /** 1項目だけ保存 */
  const saveCell = async () => {
    if (!cell || !session) return;
    setSaving(true);
    const existing = byDate[cell.date];
    const value = cell.value.trim() === "" ? null : cell.value;
    const patch = { [cell.key]: value } as Partial<Record<FieldKey, string | null>>;
    const { error } = existing
      ? await supabase.from("schedules").update(patch).eq("id", existing.id)
      : await supabase.from("schedules").insert({ user_id: session.user.id, entry_date: cell.date, ...patch });
    setSaving(false);
    if (error) {
      toast.error("保存に失敗しました");
      return;
    }
    setCell(null);
    void load();
  };

  const remove = async (date: string) => {
    const existing = byDate[date];
    if (!existing) return;
    const { error } = await supabase
      .from("schedules")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) {
      toast.error("削除に失敗しました");
      return;
    }
    toast.success("ごみ箱へ移動しました");
    setCell(null);
    void load();
  };

  const csv = useMemo(
    () => ({
      headers: ["日付", "サイズ", "コメント分類", "操業コメント", "修理項目", "その他予定", "個人予定"],
      body: (rows ?? [])
        .slice()
        .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
        .map((r) => [
          r.entry_date,
          r.size,
          r.comment_category,
          r.operation_comment,
          r.repair_item,
          r.new_effort,
          r.personal_plan,
        ]),
    }),
    [rows],
  );

  /** 検索ヒット（日付昇順・項目順） */
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as { date: string; key: FieldKey }[];
    return (rows ?? [])
      .slice()
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
      .flatMap((r) =>
        COLUMNS.filter((c) => String(r[c.key] ?? "").toLowerCase().includes(q)).map((c) => ({
          date: r.entry_date,
          key: c.key,
        })),
      );
  }, [rows, query]);

  useEffect(() => {
    setHitIndex(-1);
  }, [query]);

  const gotoHit = (next: number) => {
    if (hits.length === 0) {
      toast.info("該当する項目はありません");
      return;
    }
    const idx = ((next % hits.length) + hits.length) % hits.length;
    setHitIndex(idx);
    const hit = hits[idx]!;
    setMonth(hit.date.slice(0, 7));
    setTimeout(() => {
      document.getElementById(`cell-${hit.date}-${hit.key}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 60);
  };

  const isHit = (date: string, key: FieldKey) => hits.some((h) => h.date === date && h.key === key);
  const isCurrentHit = (date: string, key: FieldKey) =>
    hitIndex >= 0 && hits[hitIndex]?.date === date && hits[hitIndex]?.key === key;

  const pickImport = async (file: File | undefined) => {
    if (!file) return;
    if (file.name !== IMPORT_FILE_NAME) {
      toast.error(`「${IMPORT_FILE_NAME}」のみ読み込めます`);
      return;
    }
    try {
      const parsed = await parseScheduleExcel(file);
      if (parsed.length === 0) {
        toast.error("読み込める行がありませんでした");
        return;
      }
      setImportRows(parsed);
    } catch {
      toast.error("Excelの読み込みに失敗しました");
    }
  };

  const runImport = async () => {
    if (!importRows || !session) return;
    setImporting(true);
    let ok = 0;
    for (const r of importRows) {
      const { entry_date, ...fields } = r;
      const payload = Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v && String(v).trim() !== ""),
      ) as Partial<Record<FieldKey | "quality", string>>;
      if (Object.keys(payload).length === 0) continue;
      const existing = byDate[entry_date];
      const { error } = existing
        ? await supabase.from("schedules").update(payload).eq("id", existing.id)
        : await supabase.from("schedules").insert({ user_id: session.user.id, entry_date, ...payload });
      if (!error) ok += 1;
    }
    setImporting(false);
    setImportRows(null);
    toast.success(`${ok}件を反映しました`);
    void load();
  };

  const days = daysOfMonth(month);
  const editingColumn = cell ? COLUMNS.find((c) => c.key === cell.key) : undefined;
  const cat = cell?.key === "comment_category" ? parseCategory(cell.value) : null;
  const pickerYear = Number(month.slice(0, 4));

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="スケジュール" />
      <main className="mx-auto max-w-6xl px-3 pb-24 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="bg-card" aria-label="前の月" onClick={() => shiftMonth(-1)}>
              <ChevronLeft className="size-5" />
            </Button>
            <button
              type="button"
              className="min-w-28 rounded-md px-2 py-1 text-center text-base font-bold underline decoration-dotted"
              onClick={() => setMonthPicker(true)}
            >
              {`${month.slice(0, 4)}年${Number(month.slice(5))}月`}
            </button>
            <Button variant="outline" size="icon" className="bg-card" aria-label="次の月" onClick={() => shiftMonth(1)}>
              <ChevronRight className="size-5" />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => importRef.current?.click()}>
              <FileUp className="size-4" /> 読込
            </Button>
            <input
              ref={importRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                void pickImport(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  <FileDown className="size-4" /> 出力
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportScheduleExcel(rows ?? [])}>Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportCsv(csv.headers, csv.body, "スケジュール.csv")}>
                  CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => exportPdf("三条工場 申し送り", csv.headers, csv.body as (string | null)[][])}
                >
                  PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pl-8"
              placeholder="全期間から検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") gotoHit(hitIndex + 1);
              }}
            />
          </div>
          <Button variant="outline" className="h-11 bg-card" onClick={() => gotoHit(hitIndex + 1)}>
            次へ
          </Button>
          {query.trim() ? (
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {hits.length === 0 ? "0件" : `${hitIndex + 1 || 1}/${hits.length}件`}
            </span>
          ) : null}
        </div>

        {rows === null ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[900px] border-collapse text-left text-[13px]">
              <thead className="bg-secondary text-secondary-foreground">
                <tr>
                  <th className="sticky left-0 z-10 w-24 border-b border-border bg-secondary px-2 py-2 font-bold">
                    日付
                  </th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className={`border-b border-border px-2 py-2 font-bold ${c.width}`}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((d) => {
                  const r = byDate[d];
                  const wd = new Date(d + "T00:00:00").getDay();
                  return (
                    <tr key={d} className="border-b border-border align-top">
                      <th
                        scope="row"
                        className={`sticky left-0 z-10 whitespace-nowrap border-r border-border bg-card px-2 py-2 text-left font-bold ${
                          wd === 0 ? "text-destructive" : wd === 6 ? "text-primary" : ""
                        }`}
                      >
                        {Number(d.slice(8))}日（{WEEK[wd]}）
                      </th>
                      {COLUMNS.map((c) => (
                        <td
                          key={c.key}
                          id={`cell-${d}-${c.key}`}
                          className={`cursor-text border-r border-border px-2 py-2 align-top whitespace-pre-wrap transition-colors hover:bg-secondary/40 ${
                            isCurrentHit(d, c.key)
                              ? "bg-primary/20 ring-2 ring-inset ring-primary"
                              : isHit(d, c.key)
                                ? "bg-primary/10"
                                : ""
                          }`}
                          onClick={() => setCell({ date: d, key: c.key, value: (r?.[c.key] as string) ?? "" })}
                        >
                          {(r?.[c.key] as string) ?? ""}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">セルをタップすると、その項目だけを直接編集できます。</p>
      </main>

      {/* セル単位の編集 */}
      <Dialog open={!!cell} onOpenChange={(o) => !o && setCell(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {cell ? `${Number(cell.date.slice(5, 7))}/${Number(cell.date.slice(8))} ${editingColumn?.label}` : ""}
            </DialogTitle>
          </DialogHeader>
          {cell ? (
            <div className="space-y-4">
              {cell.key === "comment_category" && cat ? (
                <div className="space-y-3">
                  <Label>日数</Label>
                  <div className="grid grid-cols-4 gap-2">
                    <Button
                      variant={cat.day === "" ? "default" : "outline"}
                      className={cat.day === "" ? "" : "bg-card"}
                      onClick={() => setCell({ ...cell, value: buildCategory("", cat.renso) })}
                    >
                      なし
                    </Button>
                    {DAY_OPTIONS.map((d) => (
                      <Button
                        key={d}
                        variant={cat.day === d ? "default" : "outline"}
                        className={cat.day === d ? "" : "bg-card"}
                        onClick={() => setCell({ ...cell, value: buildCategory(d, cat.renso) })}
                      >
                        {d}
                      </Button>
                    ))}
                  </div>
                  <label className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm font-medium">連操</span>
                    <Switch
                      checked={cat.renso}
                      onCheckedChange={(v) => setCell({ ...cell, value: buildCategory(cat.day, v) })}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">表示：{cell.value || "（空欄）"}</p>
                </div>
              ) : editingColumn?.multiline ? (
                <Textarea
                  autoFocus
                  rows={5}
                  value={cell.value}
                  onChange={(e) => setCell({ ...cell, value: e.target.value })}
                />
              ) : (
                <Input
                  autoFocus
                  className="h-12"
                  value={cell.value}
                  onChange={(e) => setCell({ ...cell, value: e.target.value })}
                />
              )}
              <div className="flex gap-2 pb-2">
                <Button size="lg" className="h-12 flex-1" disabled={saving} onClick={saveCell}>
                  <Save className="size-5" /> 保存
                </Button>
                {byDate[cell.date] ? (
                  <Button size="lg" variant="destructive" className="h-12" onClick={() => remove(cell.date)}>
                    <Trash2 className="size-5" />
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 年月ジャンプ */}
      <Dialog open={monthPicker} onOpenChange={setMonthPicker}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>年月を選択</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="bg-card"
                aria-label="前年"
                onClick={() => setMonth(`${pickerYear - 1}-${month.slice(5)}`)}
              >
                <ChevronLeft className="size-5" />
              </Button>
              <span className="text-lg font-bold">{pickerYear}年</span>
              <Button
                variant="outline"
                size="icon"
                className="bg-card"
                aria-label="翌年"
                onClick={() => setMonth(`${pickerYear + 1}-${month.slice(5)}`)}
              >
                <ChevronRight className="size-5" />
              </Button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <Button
                  key={m}
                  variant={Number(month.slice(5)) === m ? "default" : "outline"}
                  className={Number(month.slice(5)) === m ? "h-12" : "h-12 bg-card"}
                  onClick={() => {
                    setMonth(`${pickerYear}-${pad(m)}`);
                    setMonthPicker(false);
                  }}
                >
                  {m}月
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* インポート確認 */}
      <AlertDialog open={!!importRows} onOpenChange={(o) => !o && setImportRows(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excelの内容で上書きします</AlertDialogTitle>
            <AlertDialogDescription>
              {importRows?.length ?? 0}日分の入力を現在のスケジュールへ反映します。Excelが空欄の項目は変更しません。よろしいですか？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              disabled={importing}
              onClick={(e) => {
                e.preventDefault();
                void runImport();
              }}
            >
              上書きする
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
