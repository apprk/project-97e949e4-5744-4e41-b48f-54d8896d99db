import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { fmtYen } from "@/lib/purchases";

export const Route = createFileRoute("/_authenticated/purchase-analytics")({
  beforeLoad: async () => {
    const { data } = await supabase.rpc("is_admin");
    if (!data) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "物品購入 分析 | 三条工場 業務管理" },
      { name: "description", content: "発注先別の支払額・割合と納品日による金額推移。" },
      { property: "og:title", content: "物品購入 分析 | 三条工場 業務管理" },
      { property: "og:description", content: "発注先別の支払額・割合と納品日による金額推移。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyticsPage,
});

type Row = { supplier: string | null; delivered_on: string; amount: number | null };
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function weekStart(s: string) {
  const d = new Date(s + "T00:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
}

function AnalyticsPage() {
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth() - 5, 1)));
  const [to, setTo] = useState(iso(now));
  const [unit, setUnit] = useState<"day" | "week" | "month">("month");
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    setRows(null);
    void supabase
      .from("purchases")
      .select("supplier,delivered_on,amount")
      .is("deleted_at", null)
      .not("delivered_on", "is", null)
      .gte("delivered_on", from)
      .lte("delivered_on", to)
      .then(({ data }) => setRows((data as Row[]) ?? []));
  }, [from, to]);

  const { bySupplier, total, trend } = useMemo(() => {
    const m = new Map<string, number>();
    const t = new Map<string, number>();
    let total = 0;
    for (const r of rows ?? []) {
      const a = Number(r.amount ?? 0);
      if (!a) continue;
      total += a;
      const s = r.supplier?.trim() || "（未入力）";
      m.set(s, (m.get(s) ?? 0) + a);
      const k = unit === "day" ? r.delivered_on : unit === "week" ? weekStart(r.delivered_on) : r.delivered_on.slice(0, 7);
      t.set(k, (t.get(k) ?? 0) + a);
    }
    const bySupplier = [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const trend = [...t.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, value]) => ({
      label: unit === "month" ? `${Number(k.slice(0, 4))}/${Number(k.slice(5))}` : `${Number(k.slice(5, 7))}/${Number(k.slice(8))}${unit === "week" ? "週" : ""}`,
      value,
    }));
    return { bySupplier, total, trend };
  }, [rows, unit]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="物品購入 分析" back="/settings" />
      <main className="mx-auto max-w-4xl space-y-4 px-3 pb-24 pt-4">
        <section className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
          <span className="text-sm font-bold">期間（納品日）</span>
          <Input type="date" className="h-10 w-40" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="開始日" />
          <span>〜</span>
          <Input type="date" className="h-10 w-40" value={to} onChange={(e) => setTo(e.target.value)} aria-label="終了日" />
          <span className="ml-auto text-sm">合計 <b className="text-lg">{fmtYen(total)}</b></span>
        </section>

        {rows === null ? (
          <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 font-bold">発注先別 支払額・割合</h2>
              {bySupplier.length === 0 ? (
                <p className="text-sm text-muted-foreground">この期間の納品済データはありません。</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="h-64">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={bySupplier} dataKey="value" nameKey="name" outerRadius="80%" innerRadius="45%">
                          {bySupplier.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => fmtYen(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {bySupplier.map((s, i) => (
                        <tr key={s.name} className="border-b border-border">
                          <td className="py-2"><span className="mr-2 inline-block size-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />{s.name}</td>
                          <td className="py-2 text-right font-bold">{fmtYen(s.value)}</td>
                          <td className="w-16 py-2 text-right text-muted-foreground">{Math.round((s.value / total) * 100)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <h2 className="font-bold">納品日による金額推移</h2>
                <div className="ml-auto inline-flex rounded-lg border border-border p-0.5">
                  {(["day", "week", "month"] as const).map((u) => (
                    <button key={u} type="button" onClick={() => setUnit(u)} className={`rounded-md px-3 py-1 text-sm ${unit === u ? "bg-primary text-primary-foreground" : ""}`}>
                      {u === "day" ? "日" : u === "week" ? "週" : "月"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={(v: number) => (v >= 10000 ? `${v / 10000}万` : String(v))} />
                    <Tooltip formatter={(v: number) => fmtYen(v)} />
                    <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
