import { subtotal, type Purchase } from "./purchases";

export type AnalyticsUnit = "day" | "week" | "month";
type AnalyticsRow = Pick<Purchase, "supplier" | "delivered_on" | "amount" | "quantity">;

export function aggregatePurchases(rows: AnalyticsRow[], from: string, to: string, unit: AnalyticsUnit) {
  const suppliers = new Map<string, number>();
  const periods = new Map<string, number>();
  let total = 0;
  let datedCount = 0;
  let pricedCount = 0;
  for (const row of rows) {
    const date = row.delivered_on;
    if (!date || (from && date < from) || (to && date > to)) continue;
    datedCount++;
    const value = subtotal(row);
    if (value === null || !Number.isFinite(value)) continue;
    pricedCount++;
    total += value;
    const supplier = row.supplier?.trim() || "（未入力）";
    suppliers.set(supplier, (suppliers.get(supplier) ?? 0) + value);
    let key = date;
    if (unit === "month") key = date.slice(0, 7);
    if (unit === "week") {
      const d = new Date(`${date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      key = d.toISOString().slice(0, 10);
    }
    periods.set(key, (periods.get(key) ?? 0) + value);
  }
  const bySupplier = [...suppliers].map(([name, value]) => ({ name, value, percentage: total === 0 ? 0 : value / total * 100 })).sort((a, b) => b.value - a.value);
  const trend = [...periods].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({
    key,
    label: unit === "month" ? `${Number(key.slice(0, 4))}/${Number(key.slice(5))}` : `${Number(key.slice(5, 7))}/${Number(key.slice(8))}${unit === "week" ? "週" : ""}`,
    value,
  }));
  return { bySupplier, trend, total, datedCount, pricedCount };
}