import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileDown, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DIARY_HEADERS, exportCsv, exportPdf, exportScheduleExcel } from "@/lib/exporters";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/schedule")({
  head: () => ({
    meta: [
      { title: "スケジュール管理 | 三条工場 業務管理" },
      { name: "description", content: "日付ごとの申し送り入力とExcel・CSV・PDF出力。" },
      { property: "og:title", content: "スケジュール管理 | 三条工場 業務管理" },
      { property: "og:description", content: "日付ごとの申し送り入力とExcel・CSV・PDF出力。" },
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

const today = () => new Date().toISOString().slice(0, 10);

const FIELDS: { key: keyof Schedule; label: string; multiline?: boolean }[] = [
  { key: "size", label: "サイズ" },
  { key: "comment_category", label: "コメント分類" },
  { key: "operation_comment", label: "操業コメント／出来事のポイント", multiline: true },
  { key: "repair_item", label: "故障／運休状況／修理項目", multiline: true },
  { key: "new_effort", label: "新たな取組／MY／次回確認", multiline: true },
  { key: "quality", label: "品質", multiline: true },
  { key: "personal_plan", label: "個人予定", multiline: true },
];

function SchedulePage() {
  const { session } = useAuth();
  const [rows, setRows] = useState<Schedule[] | null>(null);
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

  const save = async () => {
    if (!editing || !session) return;
    setSaving(true);
    const payload = {
      user_id: session.user.id,
      entry_date: editing.entry_date,
      size: editing.size,
      comment_category: editing.comment_category,
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
      headers: ["日時", ...DIARY_HEADERS, "個人予定"],
      body: (rows ?? []).map((r) => [
        r.entry_date,
        r.size,
        r.comment_category,
        r.operation_comment,
        r.repair_item,
        r.new_effort,
        r.quality,
        r.personal_plan,
      ]),
    }),
    [rows],
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="スケジュール管理" />
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-4">
        <div className="flex flex-wrap gap-2">
          <Button size="lg" className="h-12 flex-1" onClick={() => setEditing(empty(today()))}>
            <Plus className="size-5" /> 新しい日付を入力
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" className="bg-card" onClick={() => exportScheduleExcel(rows ?? [])}>
            <FileDown className="size-4" /> Excel出力
          </Button>
          <Button
            variant="outline"
            className="bg-card"
            onClick={() => exportCsv(csv.headers, csv.body, "スケジュール.csv")}
          >
            <FileDown className="size-4" /> CSV出力
          </Button>
          <Button
            variant="outline"
            className="bg-card"
            onClick={() => exportPdf("三条工場 申し送り", csv.headers, csv.body as (string | null)[][])}
          >
            <FileDown className="size-4" /> PDF出力
          </Button>
        </div>

        {rows === null ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">まだ登録がありません。</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setEditing(r)}
                  className="w-full rounded-xl border border-border bg-card px-4 py-4 text-left transition-transform active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base font-bold">{r.entry_date}</span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                      {r.size || "サイズ未入力"}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {r.operation_comment || r.repair_item || "（コメントなし）"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
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
