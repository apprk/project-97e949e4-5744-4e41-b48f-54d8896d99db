import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, FileDown, FileUp, Loader2, Palette, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportCsv, exportPdf, exportScheduleExcel, parseScheduleExcel, IMPORT_FILE_NAME } from "@/lib/exporters";
import type { ImportedRow, ScheduleField } from "@/lib/exporters";
import { isDefaultGray } from "@/lib/holidays";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/schedule")({
  head: () => ({
    meta: [
      { title: "スケジュール | 三条工場 業務管理" },
      { name: "description", content: "日付ごとの申し送りを一覧で直接入力し、Excel・CSV・PDFへ出力します。" },
      { property: "og:title", content: "スケジュール | 三条工場 業務管理" },
      { property: "og:description", content: "日付ごとの申し送りを一覧で直接入力し、Excel・CSV・PDFへ出力します。" },
    ],
  }),
  component: SchedulePage,
});

type Schedule = {
  id: string;
  entry_date: string;
  size: string | null;
  comment_category: string | null;
  operation_comment: string | null;
  repair_item: string | null;
  new_effort: string | null;
  personal_plan: string | null;
};

const COLUMNS: { key: ScheduleField; label: string; defaultWidth: number }[] = [
  { key: "size", label: "サイズ", defaultWidth: 92 },
  { key: "comment_category", label: "コメント分類", defaultWidth: 116 },
  { key: "operation_comment", label: "操業コメント", defaultWidth: 300 },
  { key: "repair_item", label: "修理項目", defaultWidth: 200 },
  { key: "new_effort", label: "その他予定", defaultWidth: 190 },
  { key: "personal_plan", label: "個人予定", defaultWidth: 190 },
];

const DATE_COL_KEY = "__date";
const DEFAULT_DATE_WIDTH = 104;
const DEFAULT_ROW_HEIGHT = 40;
const WIDTH_STORE = "sanjo.schedule.colWidths";
const HEIGHT_STORE = "sanjo.schedule.rowHeights";

const pad = (n: number) => String(n).padStart(2, "0");
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

/** 今日の行を途切れない赤枠で囲む（セルごとの内側シャドウで太さを統一） */
function todayShadow(first: boolean, last: boolean) {
  const parts = ["inset 0 2px 0 0 var(--destructive)", "inset 0 -2px 0 0 var(--destructive)"];
  if (first) parts.push("inset 2px 0 0 0 var(--destructive)");
  if (last) parts.push("inset -2px 0 0 0 var(--destructive)");
  return parts.join(", ");
}

function daysOfMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  const last = new Date(y!, m!, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${key}-${pad(i + 1)}`);
}

function readStore<T>(key: string): Record<string, T> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, T>;
  } catch {
    return {};
  }
}

function SchedulePage() {
  const { session } = useAuth();
  const [rows, setRows] = useState<Schedule[] | null>(null);
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [monthPicker, setMonthPicker] = useState(false);
  const [holidayMode, setHolidayMode] = useState(false);
  const [editing, setEditing] = useState<{ date: string; key: ScheduleField } | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [hitIndex, setHitIndex] = useState(-1);
  const [importRows, setImportRows] = useState<ImportedRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [heights, setHeights] = useState<Record<string, number>>({});
  const importRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  useEffect(() => {
    setWidths(readStore<number>(WIDTH_STORE));
    setHeights(readStore<number>(HEIGHT_STORE));
  }, []);

  const load = useCallback(async () => {
    const [{ data, error }, { data: mk }] = await Promise.all([
      supabase
        .from("schedules")
        .select("id,entry_date,size,comment_category,operation_comment,repair_item,new_effort,personal_plan")
        .is("deleted_at", null)
        .order("entry_date"),
      supabase.from("schedule_day_marks").select("mark_date,gray"),
    ]);
    if (error) toast.error("読み込みに失敗しました");
    setRows((data as Schedule[]) ?? []);
    const map: Record<string, boolean> = {};
    (mk ?? []).forEach((m) => {
      map[m.mark_date as string] = m.gray as boolean;
    });
    setMarks(map);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byDate = useMemo(() => {
    const map: Record<string, Schedule> = {};
    (rows ?? []).forEach((r) => {
      if (!map[r.entry_date]) map[r.entry_date] = r;
    });
    return map;
  }, [rows]);

  const colWidth = (key: string) =>
    widths[key] ?? (key === DATE_COL_KEY ? DEFAULT_DATE_WIDTH : COLUMNS.find((c) => c.key === key)!.defaultWidth);
  const rowHeight = (date: string) => heights[date] ?? DEFAULT_ROW_HEIGHT;
  const tableWidth = colWidth(DATE_COL_KEY) + COLUMNS.reduce((s, c) => s + colWidth(c.key), 0);

  const startColResize = (key: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidth(key);
    const move = (ev: PointerEvent) => {
      const next = Math.max(60, Math.round(startW + ev.clientX - startX));
      setWidths((prev) => ({ ...prev, [key]: next }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setWidths((prev) => {
        localStorage.setItem(WIDTH_STORE, JSON.stringify(prev));
        return prev;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startRowResize = (date: string, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startH = rowHeight(date);
    const move = (ev: PointerEvent) => {
      const next = Math.max(28, Math.round(startH + ev.clientY - startY));
      setHeights((prev) => ({ ...prev, [date]: next }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setHeights((prev) => {
        localStorage.setItem(HEIGHT_STORE, JSON.stringify(prev));
        return prev;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    setMonth(monthKey(new Date(y!, m! - 1 + delta, 1)));
  };

  /** セル編集の確定（値が変わっていなければ何もしない） */
  const commit = async () => {
    const target = editing;
    setEditing(null);
    if (!target || !session) return;
    const current = (byDate[target.date]?.[target.key] as string | null) ?? "";
    const value = draft.trim() === "" ? null : draft;
    if ((current || "") === (value || "")) return;
    const existing = byDate[target.date];
    // 画面を先に更新して、Excelのような連続入力を止めない
    setRows((prev) =>
      existing
        ? (prev ?? []).map((r) => (r.id === existing.id ? { ...r, [target.key]: value } : r))
        : prev,
    );
    const patch: Partial<Record<ScheduleField, string | null>> = { [target.key]: value };
    const { error } = existing
      ? await supabase.from("schedules").update(patch).eq("id", existing.id)
      : await supabase.from("schedules").insert({ user_id: session.user.id, entry_date: target.date, ...patch });
    if (error) {
      toast.error("保存に失敗しました");
    }
    if (!existing) void load();
  };

  const openCell = (date: string, key: ScheduleField) => {
    if (holidayMode) return;
    setDraft((byDate[date]?.[key] as string | null) ?? "");
    setEditing({ date, key });
  };

  const toggleGray = async (date: string) => {
    if (!session) return;
    const next = !(marks[date] ?? isDefaultGray(date));
    setMarks((prev) => ({ ...prev, [date]: next }));
    const { error } = await supabase
      .from("schedule_day_marks")
      .upsert({ user_id: session.user.id, mark_date: date, gray: next }, { onConflict: "user_id,mark_date" });
    if (error) toast.error("設定の保存に失敗しました");
  };

  const csv = useMemo(
    () => ({
      headers: ["日付", "曜日", "サイズ", "コメント分類", "操業コメント", "修理項目", "その他予定", "個人予定"],
      body: (rows ?? [])
        .slice()
        .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
        .map((r) => [
          r.entry_date,
          WEEK[new Date(r.entry_date + "T00:00:00").getDay()]!,
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

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as { date: string; key: ScheduleField }[];
    return (rows ?? [])
      .slice()
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
      .flatMap((r) =>
        COLUMNS.filter((c) =>
          String(r[c.key] ?? "")
            .toLowerCase()
            .includes(q),
        ).map((c) => ({ date: r.entry_date, key: c.key })),
      );
  }, [rows, query]);

  useEffect(() => {
    setHitIndex(-1);
  }, [query]);

  const scrollToDate = (date: string) => {
    setTimeout(() => {
      document.getElementById(`row-${date}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
  };

  const gotoToday = () => {
    const t = todayKey();
    setMonth(t.slice(0, 7));
    scrollToDate(t);
  };

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
    }, 80);
  };

  const isHit = (date: string, key: ScheduleField) => hits.some((h) => h.date === date && h.key === key);
  const isCurrentHit = (date: string, key: ScheduleField) =>
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
        toast.error("読み込める行がありませんでした（diary22以降のシートが対象です）");
        return;
      }
      const dates = parsed.map((r) => r.entry_date).sort();
      setRange({ start: dates[0]!, end: dates[dates.length - 1]! });
      setImportRows(parsed);
    } catch {
      toast.error("Excelの読み込みに失敗しました");
    }
  };

  /** 期間で絞ったインポート対象。範囲外の日付は一切変更しない */
  const targetRows = useMemo(
    () => (importRows ?? []).filter((r) => r.entry_date >= range.start && r.entry_date <= range.end),
    [importRows, range],
  );

  const runImport = async () => {
    if (!importRows || !session) return;
    if (range.start > range.end) {
      toast.error("開始日が終了日より後になっています");
      return;
    }
    setImporting(true);
    setProgress({ done: 0, total: targetRows.length });
    const { data: fresh } = await supabase
      .from("schedules")
      .select("id,entry_date")
      .is("deleted_at", null)
      .gte("entry_date", range.start)
      .lte("entry_date", range.end);
    const idByDate: Record<string, string> = {};
    (fresh ?? []).forEach((r) => {
      if (!idByDate[r.entry_date as string]) idByDate[r.entry_date as string] = r.id as string;
    });
    let ok = 0;
    const inserts: Record<string, unknown>[] = [];
    for (const r of targetRows) {
      const { entry_date, ...fields } = r;
      const payload = Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v && String(v).trim() !== ""),
      ) as Partial<Record<ScheduleField, string>>;
      if (Object.keys(payload).length === 0) continue;
      const id = idByDate[entry_date];
      if (id) {
        const { error } = await supabase.from("schedules").update(payload).eq("id", id);
        if (!error) ok += 1;
      } else {
        inserts.push({ user_id: session.user.id, entry_date, ...payload });
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    // 新規分はまとめて登録し、件数が多い年でも取りこぼさない
    for (let i = 0; i < inserts.length; i += 100) {
      const chunk = inserts.slice(i, i + 100);
      const { error } = await supabase.from("schedules").insert(chunk as never);
      if (!error) ok += chunk.length;
    }
    setImporting(false);
    setImportRows(null);
    toast.success(`${ok}件を反映しました`);
    void load();
  };

  const days = daysOfMonth(month);
  const today = todayKey();
  const pickerYear = Number(month.slice(0, 4));
  const dateLeft = 0;
  const sizeLeft = colWidth(DATE_COL_KEY);

  const syncScroll = (from: "top" | "body") => {
    if (syncing.current) return;
    syncing.current = true;
    const top = topBarRef.current;
    const body = scrollRef.current;
    if (top && body) {
      if (from === "top") body.scrollLeft = top.scrollLeft;
      else top.scrollLeft = body.scrollLeft;
    }
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="スケジュール" />
      <main className="mx-auto max-w-7xl px-3 pb-24 pt-4">
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
            <Button variant="outline" className="ml-1 bg-card" onClick={gotoToday}>
              <CalendarDays className="size-4" /> 今日
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant={holidayMode ? "secondary" : "ghost"}
              size="sm"
              className={holidayMode ? "" : "text-muted-foreground"}
              onClick={() => {
                setHolidayMode((v) => !v);
                setEditing(null);
              }}
            >
              <Palette className="size-4" /> 休日設定
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => importRef.current?.click()}
            >
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

        {holidayMode ? (
          <p className="mt-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs">
            休日設定中：日付をタップすると、その日のグレー表示をON/OFFできます。編集に戻るには「休日設定」をもう一度押してください。
          </p>
        ) : null}

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
          <div className="mt-3">
            {/* 上側の横スクロールバー */}
            <div
              ref={topBarRef}
              className="overflow-x-auto rounded-t-lg border border-b-0 border-border bg-card"
              onScroll={() => syncScroll("top")}
            >
              <div style={{ width: tableWidth, height: 1 }} />
            </div>
            <div
              ref={scrollRef}
              className="max-h-[70vh] overflow-auto rounded-b-xl border border-border bg-card"
              onScroll={() => syncScroll("body")}
            >
              <table
                className="border-separate border-spacing-0 text-left text-[13px]"
                style={{ width: tableWidth, tableLayout: "fixed" }}
              >
                <colgroup>
                  <col style={{ width: colWidth(DATE_COL_KEY) }} />
                  {COLUMNS.map((c) => (
                    <col key={c.key} style={{ width: colWidth(c.key) }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th
                      className="sticky top-0 z-40 border-b border-r border-border bg-secondary px-2 py-2 font-bold text-secondary-foreground"
                      style={{ left: dateLeft, position: "sticky", top: 0 }}
                    >
                      <span className="relative block pr-2">
                        日付
                        <span
                          role="separator"
                          aria-label="日付の列幅を変更"
                          onPointerDown={(e) => startColResize(DATE_COL_KEY, e)}
                          className="absolute -right-2 top-1/2 h-full w-3 -translate-y-1/2 cursor-col-resize"
                        />
                      </span>
                    </th>
                    {COLUMNS.map((c, i) => (
                      <th
                        key={c.key}
                        className={`sticky top-0 border-b border-r border-border bg-secondary px-2 py-2 font-bold text-secondary-foreground ${
                          i === 0 ? "z-40" : "z-30"
                        }`}
                        style={i === 0 ? { left: sizeLeft, position: "sticky", top: 0 } : undefined}
                      >
                        <span className="relative block truncate pr-2">
                          {c.label}
                          <span
                            role="separator"
                            aria-label={`${c.label}の列幅を変更`}
                            onPointerDown={(e) => startColResize(c.key, e)}
                            className="absolute -right-2 top-1/2 h-full w-3 -translate-y-1/2 cursor-col-resize"
                          />
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => {
                    const r = byDate[d];
                    const wd = new Date(d + "T00:00:00").getDay();
                    const gray = marks[d] ?? isDefaultGray(d);
                    const isToday = d === today;
                    const cellBg = gray ? "var(--schedule-gray)" : "var(--card)";
                    const h = rowHeight(d);
                    return (
                      <tr key={d} id={`row-${d}`} className="align-top">
                        <th
                          scope="row"
                          className={`sticky z-20 whitespace-nowrap border-b border-r border-border px-2 py-1.5 text-left font-bold ${
                            holidayMode ? "cursor-pointer" : ""
                          } ${wd === 0 ? "text-destructive" : wd === 6 ? "text-primary" : ""}`}
                          style={{
                            left: dateLeft,
                            height: h,
                            backgroundColor: cellBg,
                            ...(isToday ? { boxShadow: todayShadow(true, false) } : {}),
                          }}
                          onClick={() => holidayMode && void toggleGray(d)}
                        >
                          <span className="relative block">
                            {Number(d.slice(8))}日（{WEEK[wd]}）
                            <span
                              role="separator"
                              aria-label="行の高さを変更"
                              onPointerDown={(e) => startRowResize(d, e)}
                              className="absolute -bottom-1.5 left-0 h-2.5 w-full cursor-row-resize"
                            />
                          </span>
                        </th>
                        {COLUMNS.map((c, i) => {
                          const active = editing?.date === d && editing.key === c.key;
                          const value = (r?.[c.key] as string | null) ?? "";
                          const last = i === COLUMNS.length - 1;
                          return (
                            <td
                              key={c.key}
                              id={`cell-${d}-${c.key}`}
                              className={`cursor-text border-b border-r border-border p-0 align-top ${
                                i === 0 ? "sticky z-20" : ""
                              } ${
                                isCurrentHit(d, c.key)
                                  ? "ring-2 ring-inset ring-primary"
                                  : isHit(d, c.key)
                                    ? "bg-primary/10"
                                    : ""
                              }`}
                              style={{
                                height: h,
                                backgroundColor: cellBg,
                                ...(i === 0 ? { left: sizeLeft } : {}),
                                ...(isToday ? { boxShadow: todayShadow(false, last) } : {}),
                              }}
                              onClick={() => !active && openCell(d, c.key)}
                            >
                              {active ? (
                                <textarea
                                  autoFocus
                                  value={draft}
                                  onChange={(e) => setDraft(e.target.value)}
                                  onBlur={() => void commit()}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                      e.preventDefault();
                                      void commit();
                                    }
                                    if (e.key === "Escape") setEditing(null);
                                  }}
                                  className="block w-full resize-none bg-background px-2 py-1 text-[13px] leading-snug outline-none ring-2 ring-inset ring-primary"
                                  style={{ height: h, boxSizing: "border-box" }}
                                />
                              ) : (
                                <div
                                  className="w-full overflow-hidden whitespace-pre-wrap px-2 py-1 leading-snug"
                                  style={{ height: h }}
                                >
                                  {value}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          セルをタップするとその場で入力できます（Enterで確定・Shift+Enterで改行）。見出しの端をドラッグで列幅、日付の下端をドラッグで行の高さを変更できます。
        </p>
      </main>

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
            <Button
              variant="secondary"
              className="h-12 w-full"
              onClick={() => {
                setMonthPicker(false);
                gotoToday();
              }}
            >
              今日へ移動
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* インポート確認 */}
      <AlertDialog open={!!importRows} onOpenChange={(o) => !o && setImportRows(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excelの内容で上書きします</AlertDialogTitle>
            <AlertDialogDescription>
              {importRows?.length ?? 0}
              日分の入力を反映します（diary22以降のシート・3行目以降が対象）。Excelが空欄の項目は変更しません。よろしいですか？
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
