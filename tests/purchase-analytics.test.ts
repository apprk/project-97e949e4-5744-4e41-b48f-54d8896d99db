import { describe, expect, test } from "bun:test";
import { aggregatePurchases } from "../src/lib/purchase-analytics";

const row = (supplier: string, delivered_on: string | null, amount: number | null, quantity: number | null) => ({ supplier, delivered_on, amount, quantity });
describe("purchase analytics", () => {
  test("supplier totals use unit price times quantity", () => {
    const result = aggregatePurchases([row("○○商事", "2026-10-01", 125000, 10), row("△△商会", "2026-10-19", 85000, 10), row("□□産業", "2026-10-19", 42000, 10)], "2026-10-01", "2026-10-19", "day");
    expect(result.bySupplier.map((s) => s.value)).toEqual([1250000, 850000, 420000]);
    expect(result.total).toBe(2520000);
  });
  test("supplier percentages use subtotal share", () => {
    expect(aggregatePurchases([row("A", "2026-10-01", 50, 10), row("B", "2026-10-01", 30, 10), row("C", "2026-10-01", 20, 10)], "", "", "day").bySupplier.map((s) => s.percentage)).toEqual([50, 30, 20]);
  });
  test("delivery bounds are inclusive and exclude outside dates", () => {
    expect(aggregatePurchases([row("A", "2026-09-30", 10, 1), row("A", "2026-10-01", 20, 1), row("A", "2026-10-19", 30, 1), row("A", "2026-10-20", 40, 1)], "2026-10-01", "2026-10-19", "day").total).toBe(50);
  });
  test("missing delivery dates never enter totals or trend", () => { expect(aggregatePurchases([row("A", null, 1500, 15)], "", "", "month").datedCount).toBe(0); });
  test("day week month switches retain subtotal totals", () => {
    const rows = [row("A", "2026-10-18", 100, 2), row("A", "2026-10-19", 50, 3)];
    expect(aggregatePurchases(rows, "", "", "day").trend.map((s) => s.value)).toEqual([200, 150]);
    expect(aggregatePurchases(rows, "", "", "week").trend.map((s) => s.key)).toEqual(["2026-10-12", "2026-10-19"]);
    expect(aggregatePurchases(rows, "", "", "month").trend[0]?.value).toBe(350);
  });
  test("missing prices remain distinct from no delivered rows", () => { const result = aggregatePurchases([row("A", "2026-10-19", null, 30)], "", "", "day"); expect(result.datedCount).toBe(1); expect(result.pricedCount).toBe(0); });
  test("zero subtotal is valid and percentage is finite", () => { const result = aggregatePurchases([row("A", "2026-10-19", 0, 30)], "", "", "day"); expect(result.pricedCount).toBe(1); expect(result.bySupplier[0]?.percentage).toBe(0); });
  test("reads beyond 1000 rows are all aggregated", () => { expect(aggregatePurchases(Array.from({ length: 1501 }, () => row("A", "2026-10-19", 2, 3)), "", "", "day").total).toBe(9006); });
});