import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileDown, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportCsv, exportPdf, exportScheduleExcel } from "@/lib/exporters";
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

const empty = (date: string): Schedule => ({
  id: "",
  user_id: "",
  entry_date: date,
  size: "",
  comment_category: "",
  operation_comment: "",
  repair_item: "",
  new_effort: "",
  quality: "",
  personal_plan: "",
});

/** 旧データの「コメント分類」はサイズへ統合して表示する */
const mergedSize = (r: Schedule) => [r.size, r.comment_category].filter((v) => v && v.trim()).join(" ");

const FIELDS: { key: keyof Schedule; label: string; multiline?: boolean }[] = [
  { key: "operation_comment", label: "操業コメント", multiline: true },
  { key: "repair_item", label: "修理項目", multiline: true },
  { key: "new_effort", label: "その他予定", multiline: true },
  { key: "personal_plan", label: "個人予定", multiline: true },
];

const COLUMNS: { key: keyof Schedule; label: string; width: string }[] = [
  { key: "operation_comment", label: "操業コメント", width: "min-w-56" },
  { key: "repair_item", label: "修理項目", width: "min-w-40" },
  { key: "new_effort", label: "その他予定", width: "min-w-40" },
  { key: "personal_plan", label: "個人予定", width: "min-w-40" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

function daysOfMonth(key: string) {
  const [y, m] = key.split("-").map(Number);
  const last = new Date(y!, m!, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${key}-${pad(i + 1)}`);
}

function SchedulePage() {
  const { session } = useAuth();
  const [rows, setRows] = useState<Schedule[] | null>(null);
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [saving, setSaving] = useState(false);

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

  const save = async () => {
    if (!editing || !session) return;
    setSaving(true);
    const payload = {
      user_id: session.user.id,
      entry_date: editing.entry_date,
      size: editing.size,
      comment_category: null,
      operation_comment: editing.operation_comment,
      repair_item: editing.repair_item,
      new_effort: editing.new_effort,
      quality: editing.quality,
      personal_plan: editing.personal_plan,
    };
    const { error } = editing.id
      ? await supabase.from("schedules").update(payload).eq("id", editing.id)
      : await supabase.from("schedules").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("保存に失敗しました");
      return;
    }
    toast.success("保存しました");
    setEditing(null);
    void load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("schedules").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      toast.error("削除に失敗しました");
      return;
    }
    toast.success("ごみ箱へ移動しました");
    setEditing(null);
    void load();
  };

  const csv = useMemo(
    () => ({
      headers: ["日付", "サイズ", "操業コメント", "修理項目", "その他予定", "個人予定"],
      body: (rows ?? [])
        .slice()
        .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
        .map((r) => [r.entry_date, mergedSize(r), r.operation_comment, r.repair_item, r.new_effort, r.personal_plan]),
    }),
    [rows],
  );

  const days = daysOfMonth(month);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="スケジュール" />
      <main className="mx-auto max-w-6xl px-3 pb-24 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="bg-card" aria-label="前の月" onClick={() => shiftMonth(-1)}>
              <ChevronLeft className="size-5" />
            </Button>
            <span className="min-w-28 text-center text-base font-bold">{`${month.slice(0, 4)}年${Number(month.slice(5))}月`}</span>
            <Button variant="outline" size="icon" className="bg-card" aria-label="次の月" onClick={() => shiftMonth(1)}>
              <ChevronRight className="size-5" />
            </Button>
          </div>
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

        {rows === null ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[860px] border-collapse text-left text-[13px]">
              <thead className="bg-secondary text-secondary-foreground">
                <tr>
                  <th className="sticky left-0 z-10 w-24 border-b border-border bg-secondary px-2 py-2 font-bold">
                    日付
                  </th>
                  <th className="w-28 border-b border-border px-2 py-2 font-bold">サイズ</th>
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
                    <tr
                      key={d}
                      onClick={() => setEditing(r ?? empty(d))}
                      className={`cursor-pointer border-b border-border align-top transition-colors hover:bg-secondary/40 ${
                        r ? "" : "bg-muted/40"
                      }`}
                    >
                      <th
                        scope="row"
                        className={`sticky left-0 z-10 whitespace-nowrap border-r border-border px-2 py-2 text-left font-bold ${
                          r ? "bg-card" : "bg-muted/60"
                        } ${wd === 0 ? "text-destructive" : wd === 6 ? "text-primary" : ""}`}
                      >
                        {Number(d.slice(8))}日（{WEEK[wd]}）
                      </th>
                      <td className="border-r border-border px-2 py-2 whitespace-pre-wrap">
                        {r ? mergedSize(r) : <span className="text-xs text-muted-foreground">未入力</span>}
                      </td>
                      {COLUMNS.map((c) => (
                        <td key={c.key} className="border-r border-border px-2 py-2 whitespace-pre-wrap">
                          {r ? ((r[c.key] as string) ?? "") : ""}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          灰色の行は未入力の日です。日付をタップすると入力・編集できます。
        </p>
      </main>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "予定を編集" : "予定を追加"}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="entry_date">日付</Label>
                <Input
                  id="entry_date"
                  type="date"
                  className="h-12"
                  value={editing.entry_date}
                  onChange={(e) => setEditing({ ...editing, entry_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="size">サイズ（例：1日　連操 / 0.5日 / 休日）</Label>
                <Input
                  id="size"
                  className="h-12"
                  value={mergedSize(editing)}
                  onChange={(e) => setEditing({ ...editing, size: e.target.value, comment_category: "" })}
                />
              </div>
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={f.key}>{f.label}</Label>
                  {f.multiline ? (
                    <Textarea
                      id={f.key}
                      rows={3}
                      value={(editing[f.key] as string) ?? ""}
                      onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })}
                    />
                  ) : (
                    <Input
                      id={f.key}
                      className="h-12"
                      value={(editing[f.key] as string) ?? ""}
                      onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })}
                    />
                  )}
                </div>
              ))}
              <div className="flex gap-2 pb-2">
                <Button size="lg" className="h-12 flex-1" disabled={saving} onClick={save}>
                  <Save className="size-5" /> 保存
                </Button>
                {editing.id ? (
                  <Button size="lg" variant="destructive" className="h-12" onClick={() => remove(editing.id)}>
                    <Trash2 className="size-5" />
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
