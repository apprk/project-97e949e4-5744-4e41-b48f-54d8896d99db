import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileDown, History, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exportCsv, exportPdf } from "@/lib/exporters";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/equipment")({
  head: () => ({
    meta: [
      { title: "設備管理 | 三条工場 業務管理" },
      { name: "description", content: "周期設定から次回予定日を自動生成し、実施履歴と未実施を管理します。" },
      { property: "og:title", content: "設備管理 | 三条工場 業務管理" },
      { property: "og:description", content: "周期設定から次回予定日を自動生成し、実施履歴と未実施を管理します。" },
    ],
  }),
  component: EquipmentPage,
});

type Unit = "year" | "month" | "week";
type Equipment = {
  id: string;
  user_id: string;
  name: string;
  content: string | null;
  cycle_value: number | null;
  cycle_unit: Unit | null;
  first_date: string | null;
  next_date: string | null;
};
type Hist = { id: string; equipment_id: string; performed_on: string; comment: string | null };

const UNIT_LABEL: Record<Unit, string> = { year: "年", month: "ヶ月", week: "週" };

function addCycle(date: string, value: number, unit: Unit) {
  const d = new Date(date + "T00:00:00");
  if (unit === "year") d.setFullYear(d.getFullYear() + value);
  if (unit === "month") d.setMonth(d.getMonth() + value);
  if (unit === "week") d.setDate(d.getDate() + value * 7);
  return d.toISOString().slice(0, 10);
}

/** 過去履歴から平均周期（日数）を計算 */
function averageCycleDays(list: Hist[]) {
  const dates = list.map((h) => h.performed_on).sort();
  if (dates.length < 2) return null;
  let total = 0;
  for (let i = 1; i < dates.length; i++) {
    total += (new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000;
  }
  return Math.round(total / (dates.length - 1));
}

const monthKey = (d: string) => d.slice(0, 7);
const thisMonth = () => new Date().toISOString().slice(0, 7);
const nextMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 7);
};

const emptyEq = (): Equipment => ({
  id: "",
  user_id: "",
  name: "",
  content: "",
  cycle_value: 1,
  cycle_unit: "year",
  first_date: new Date().toISOString().slice(0, 10),
  next_date: null,
});

function EquipmentPage() {
  const { session } = useAuth();
  const [items, setItems] = useState<Equipment[] | null>(null);
  const [history, setHistory] = useState<Hist[]>([]);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [historyOf, setHistoryOf] = useState<Equipment | null>(null);
  const [doneDate, setDoneDate] = useState(new Date().toISOString().slice(0, 10));
  const [doneComment, setDoneComment] = useState("");
  const [tab, setTab] = useState("this");
  const [month, setMonth] = useState(thisMonth());

  const load = async () => {
    const [{ data: eq }, { data: hs }] = await Promise.all([
      supabase.from("equipment").select("*").is("deleted_at", null).order("next_date", { nullsFirst: false }),
      supabase.from("equipment_history").select("id,equipment_id,performed_on,comment").is("deleted_at", null),
    ]);
    setItems((eq as Equipment[]) ?? []);
    setHistory((hs as Hist[]) ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    if (!editing || !session) return;
    if (!editing.name.trim()) {
      toast.error("設備名を入力してください");
      return;
    }
    const next =
      editing.first_date && editing.cycle_value && editing.cycle_unit
        ? (editing.next_date ?? addCycle(editing.first_date, editing.cycle_value, editing.cycle_unit))
        : editing.next_date;
    const payload = {
      user_id: session.user.id,
      name: editing.name.trim(),
      content: editing.content,
      cycle_value: editing.cycle_value,
      cycle_unit: editing.cycle_unit,
      first_date: editing.first_date,
      next_date: next,
    };
    const { error } = editing.id
      ? await supabase.from("equipment").update(payload).eq("id", editing.id)
      : await supabase.from("equipment").insert(payload);
    if (error) {
      toast.error("保存に失敗しました");
      return;
    }
    toast.success("保存しました");
    setEditing(null);
    void load();
  };

  const remove = async (id: string) => {
    await supabase.from("equipment").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    toast.success("ごみ箱へ移動しました");
    setEditing(null);
    void load();
  };

  /** 実施登録 → 次回予定日を自動生成（周期未設定なら平均周期を使用） */
  const complete = async () => {
    if (!historyOf || !session) return;
    const { error } = await supabase.from("equipment_history").insert({
      equipment_id: historyOf.id,
      user_id: session.user.id,
      performed_on: doneDate,
      comment: doneComment || null,
    });
    if (error) {
      toast.error("登録に失敗しました");
      return;
    }
    const own = history.filter((h) => h.equipment_id === historyOf.id);
    let next: string | null = null;
    if (historyOf.cycle_value && historyOf.cycle_unit) {
      next = addCycle(doneDate, historyOf.cycle_value, historyOf.cycle_unit);
    } else {
      const avg = averageCycleDays([...own, { id: "", equipment_id: historyOf.id, performed_on: doneDate, comment: null }]);
      if (avg) {
        const d = new Date(doneDate + "T00:00:00");
        d.setDate(d.getDate() + avg);
        next = d.toISOString().slice(0, 10);
      }
    }
    await supabase.from("equipment").update({ next_date: next }).eq("id", historyOf.id);
    toast.success(next ? `実施を登録しました（次回予定 ${next}）` : "実施を登録しました");
    setDoneComment("");
    setHistoryOf(null);
    void load();
  };

  const list = items ?? [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const filtered = useMemo(() => {
    if (tab === "overdue") return list.filter((e) => e.next_date && e.next_date < todayStr);
    if (tab === "this") return list.filter((e) => e.next_date && monthKey(e.next_date) === thisMonth());
    if (tab === "next") return list.filter((e) => e.next_date && monthKey(e.next_date) === nextMonth());
    if (tab === "month") return list.filter((e) => e.next_date && monthKey(e.next_date) === month);
    return list;
  }, [list, tab, month, todayStr]);

  const csvBody = list.map((e) => [
    e.name,
    e.content,
    e.cycle_value && e.cycle_unit ? `${e.cycle_value}${UNIT_LABEL[e.cycle_unit]}` : "",
    e.first_date,
    e.next_date,
  ]);
  const csvHeaders = ["設備名", "管理内容", "周期", "初回実施日", "次回予定日"];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="設備管理" />
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-4">
        <Button size="lg" className="h-12 w-full" onClick={() => setEditing(emptyEq())}>
          <Plus className="size-5" /> 設備を登録
        </Button>

        <Tabs value={tab} onValueChange={setTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="this">今月</TabsTrigger>
            <TabsTrigger value="next">来月</TabsTrigger>
            <TabsTrigger value="month">指定月</TabsTrigger>
            <TabsTrigger value="overdue">未実施</TabsTrigger>
            <TabsTrigger value="all">全件</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === "month" ? (
          <Input type="month" className="mt-3 h-12" value={month} onChange={(e) => setMonth(e.target.value)} />
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" className="bg-card" onClick={() => exportCsv(csvHeaders, csvBody, "設備管理.csv")}>
            <FileDown className="size-4" /> CSV出力
          </Button>
          <Button
            variant="outline"
            className="bg-card"
            onClick={() => exportPdf("設備管理一覧", csvHeaders, csvBody as (string | null)[][])}
          >
            <FileDown className="size-4" /> PDF出力
          </Button>
        </div>

        {items === null ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">該当する設備はありません。</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {filtered.map((e) => {
              const own = history.filter((h) => h.equipment_id === e.id);
              const avg = averageCycleDays(own);
              const overdue = !!e.next_date && e.next_date < todayStr;
              return (
                <li key={e.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold">{e.name}</p>
                      <p className="text-sm text-muted-foreground">{e.content}</p>
                    </div>
                    {overdue ? (
                      <span className="shrink-0 rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">
                        未実施
                      </span>
                    ) : null}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                    <div>
                      <dt className="inline">周期: </dt>
                      <dd className="inline">
                        {e.cycle_value && e.cycle_unit
                          ? `${e.cycle_value}${UNIT_LABEL[e.cycle_unit]}`
                          : avg
                            ? `平均 ${avg}日`
                            : "未設定"}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">初回: </dt>
                      <dd className="inline">{e.first_date ?? "-"}</dd>
                    </div>
                    <div>
                      <dt className="inline">次回予定: </dt>
                      <dd className="inline font-bold text-foreground">{e.next_date ?? "-"}</dd>
                    </div>
                    <div>
                      <dt className="inline">実施回数: </dt>
                      <dd className="inline">{own.length}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      className="h-11 flex-1"
                      onClick={() => {
                        setHistoryOf(e);
                        setDoneDate(new Date().toISOString().slice(0, 10));
                      }}
                    >
                      <CheckCircle2 className="size-5" /> 実施を登録
                    </Button>
                    <Button variant="outline" className="h-11 bg-card" onClick={() => setEditing(e)}>
                      編集
                    </Button>
                  </div>
                  {own.length > 0 ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-medium text-primary">
                        <History className="mr-1 inline size-3.5" />
                        履歴を表示（{own.length}件）
                      </summary>
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {own
                          .sort((a, b) => b.performed_on.localeCompare(a.performed_on))
                          .map((h) => (
                            <li key={h.id}>
                              {h.performed_on} {h.comment}
                            </li>
                          ))}
                      </ul>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "設備を編集" : "設備を登録"}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="eq-name">設備名</Label>
                <Input
                  id="eq-name"
                  className="h-12"
                  value={editing.name}
                  onChange={(ev) => setEditing({ ...editing, name: ev.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eq-content">管理内容</Label>
                <Textarea
                  id="eq-content"
                  rows={2}
                  value={editing.content ?? ""}
                  onChange={(ev) => setEditing({ ...editing, content: ev.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="eq-cycle">周期</Label>
                  <Input
                    id="eq-cycle"
                    type="number"
                    min={1}
                    className="h-12"
                    value={editing.cycle_value ?? ""}
                    onChange={(ev) =>
                      setEditing({ ...editing, cycle_value: ev.target.value ? Number(ev.target.value) : null })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>単位</Label>
                  <Select
                    value={editing.cycle_unit ?? undefined}
                    onValueChange={(v) => setEditing({ ...editing, cycle_unit: v as Unit })}
                  >
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="選択" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="year">年</SelectItem>
                      <SelectItem value="month">ヶ月</SelectItem>
                      <SelectItem value="week">週</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eq-first">初回実施日</Label>
                <Input
                  id="eq-first"
                  type="date"
                  className="h-12"
                  value={editing.first_date ?? ""}
                  onChange={(ev) => setEditing({ ...editing, first_date: ev.target.value, next_date: null })}
                />
              </div>
              <div className="flex gap-2 pb-2">
                <Button size="lg" className="h-12 flex-1" onClick={save}>
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

      <Dialog open={!!historyOf} onOpenChange={(o) => !o && setHistoryOf(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>実施を登録：{historyOf?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="done-date">実施日</Label>
              <Input
                id="done-date"
                type="date"
                className="h-12"
                value={doneDate}
                onChange={(e) => setDoneDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="done-comment">コメント</Label>
              <Textarea id="done-comment" rows={3} value={doneComment} onChange={(e) => setDoneComment(e.target.value)} />
            </div>
            <Button size="lg" className="h-12 w-full" onClick={complete}>
              <CheckCircle2 className="size-5" /> 登録して次回予定を作成
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
