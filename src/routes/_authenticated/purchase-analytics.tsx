import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { fetchPurchaseRows } from "@/lib/purchase-data";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Input } from "@/components/ui/input";
import { fmtYen, type Purchase } from "@/lib/purchases";
import { aggregatePurchases, type AnalyticsUnit } from "@/lib/purchase-analytics";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/purchase-analytics")({
  beforeLoad: async () => {
    const { data } = await supabase.rpc("has_perm", { _perm: "purchases.settings" });
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

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function AnalyticsPage() {
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth() - 5, 1)));
  const [to, setTo] = useState(iso(now));
  const [unit, setUnit] = useState<AnalyticsUnit>("month");
  const [rows, setRows] = useState<Purchase[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const supplierName = (r: Purchase) => r.supplier?.trim() || "（未入力）";
  const suppliers = useMemo(() => [...new Set((rows ?? []).map(supplierName))].sort((a, b) => a.localeCompare(b, "ja")), [rows]);
  const toggleSupplier = (name: string) => setExcluded((prev) => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; });

  useEffect(() => {
    setRows(null);
    setFailed(false);
    let active = true;
    void fetchPurchaseRows().then((data) => { if (active) setRows(data); }).catch(() => {
      if (!active) return;
      toast.error("分析を読み込めませんでした"); setFailed(true); setRows([]);
    });
    return () => { active = false; };
  }, [revision]);

  const filtered = useMemo(() => (rows ?? []).filter((r) => !excluded.has(supplierName(r))), [rows, excluded]);
  const { bySupplier, total, trend, datedCount, pricedCount } = useMemo(() => aggregatePurchases(filtered, from, to, unit), [filtered, from, to, unit]);
  const invalidPeriod = !!from && !!to && from > to;
  const emptyMessage = datedCount === 0 ? "対象データがありません。" : "対象期間の納品データはありますが、単価または数量が未入力のため集計できません。";

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="物品購入 分析" back="/purchases" />
      <main className="mx-auto max-w-4xl space-y-4 px-3 pb-24 pt-4">
        <section className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
          <span className="text-sm font-bold">期間（納品日）</span>
          <Input type="date" className="h-10 w-40" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="開始日" />
          <span>〜</span>
          <Input type="date" className="h-10 w-40" value={to} onChange={(e) => setTo(e.target.value)} aria-label="終了日" />
          <Button size="sm" variant="outline" onClick={() => setSupplierOpen(true)}><Building2 className="size-4"/>業者{excluded.size ? `（${suppliers.length - excluded.size}/${suppliers.length}）` : ""}</Button>
          <span className="ml-auto text-sm">小計合計 <b className="text-lg">{fmtYen(total)}</b></span>
        </section>

        {invalidPeriod ? <p role="alert" className="text-destructive">開始日を終了日以前にしてください。</p> : failed ? (
          <div role="alert" className="space-y-2"><p>分析データを読み込めませんでした。</p><Button variant="outline" onClick={() => setRevision((r) => r + 1)}>再読み込み</Button></div>
        ) : rows === null ? (
          <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 font-bold">発注先別 支払額・割合</h2>
              {pricedCount === 0 ? (
                <p className="text-sm text-muted-foreground">{emptyMessage}</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="h-64">
                    {total === 0 ? <p className="text-sm text-muted-foreground">小計合計は0円です。</p> :
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={bySupplier} dataKey="value" nameKey="name" outerRadius="80%" innerRadius="45%">
                          {bySupplier.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => fmtYen(v)} />
                      </PieChart>
                    </ResponsiveContainer>}
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {bySupplier.map((s, i) => (
                        <tr key={s.name} className="border-b border-border">
                          <td className="py-2"><span className="mr-2 inline-block size-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />{s.name}</td>
                          <td className="py-2 text-right font-bold">{fmtYen(s.value)}</td>
                          <td className="w-16 py-2 text-right text-muted-foreground">{Math.round(s.percentage)}%</td>
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
                    <Button key={u} size="sm" variant={unit === u ? "default" : "ghost"} onClick={() => setUnit(u)}>
                      {u === "day" ? "日" : u === "week" ? "週" : "月"}
                    </Button>
                  ))}
                </div>
              </div>
              {pricedCount === 0 ? <p className="text-sm text-muted-foreground">{emptyMessage}</p> : <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={(v: number) => (v >= 10000 ? `${v / 10000}万` : String(v))} />
                    <Tooltip formatter={(v: number) => fmtYen(v)} />
                    <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>}
            </section>
          </>
        )}
      </main>
      <Dialog open={supplierOpen} onOpenChange={setSupplierOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>分析対象の業者</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">チェックを外した業者は、すべての分析結果から除外されます。履歴データ自体は変更されません。</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setExcluded(new Set())}>すべて選択</Button>
            <Button size="sm" variant="outline" onClick={() => setExcluded(new Set(suppliers))}>すべて解除</Button>
          </div>
          <ul className="divide-y divide-border">
            {suppliers.map((name) => (
              <li key={name}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2">
                  <input type="checkbox" className="size-5 accent-primary" checked={!excluded.has(name)} onChange={() => toggleSupplier(name)} aria-label={`${name}を分析対象に含める`} />
                  <span className="break-words">{name}</span>
                </label>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
