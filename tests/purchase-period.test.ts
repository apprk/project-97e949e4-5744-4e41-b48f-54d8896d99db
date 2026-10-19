import { describe, expect, test } from "bun:test";
import { activePurchasePeriod, currentFiscalYear, fiscalPeriod, matchesPurchasePeriod } from "../src/lib/purchase-period";

describe("purchase fiscal and custom periods", () => {
  test("October 19 2026 defaults to fiscal 2026", () => { expect(currentFiscalYear(new Date("2026-10-19T05:45:00Z"))).toBe(2026); });
  test("January 2027 still belongs to fiscal 2026", () => { expect(currentFiscalYear(new Date("2027-01-15T00:00:00Z"))).toBe(2026); });
  test("Japan April 1 switches the default fiscal year", () => { expect(currentFiscalYear(new Date("2027-03-31T14:59:59Z"))).toBe(2026); expect(currentFiscalYear(new Date("2027-03-31T15:00:00Z"))).toBe(2027); });
  test("fiscal 2026 spans April 1 to March 31", () => { expect(fiscalPeriod(2026)).toEqual({ from: "2026-04-01", to: "2027-03-31" }); });
  test("fiscal 2024 spans April 1 to March 31", () => { expect(fiscalPeriod(2024)).toEqual({ from: "2024-04-01", to: "2025-03-31" }); });
  test("written dates include both fiscal boundaries only", () => { const p = fiscalPeriod(2026); expect(matchesPurchasePeriod("2026-04-01", p)).toBe(true); expect(matchesPurchasePeriod("2027-03-31", p)).toBe(true); expect(matchesPurchasePeriod("2026-03-31", p)).toBe(false); expect(matchesPurchasePeriod("2027-04-01", p)).toBe(false); });
  test("custom period overrides rather than intersects the year", () => { const p = activePurchasePeriod(2024, { from: "2026-06-01", to: "2026-08-31" }); expect(matchesPurchasePeriod("2026-06-01", p)).toBe(true); expect(matchesPurchasePeriod("2026-08-31", p)).toBe(true); expect(matchesPurchasePeriod("2026-09-01", p)).toBe(false); });
  test("removing a custom period restores the selected year", () => { expect(activePurchasePeriod(2024, null)).toEqual({ from: "2024-04-01", to: "2025-03-31" }); });
});