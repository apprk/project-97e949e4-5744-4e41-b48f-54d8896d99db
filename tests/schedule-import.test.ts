import { describe, expect, test } from "bun:test";
import * as XLSX from "xlsx";
import { inspectScheduleExcel } from "../src/lib/exporters";
import { importPlan, readAllPages } from "../src/lib/schedule-import";

describe("schedule import", () => {
  test("range includes 2024-07-13 and 2026-11-30 but excludes outside dates", () => {
    const source = ["2024-07-12", "2024-07-13", "2025-01-01", "2026-11-30", "2026-12-01"].map(entry_date => ({ entry_date, size: "入力" }));
    expect(importPlan(source, [], "2024-07-13", "2026-11-30").actions.map(a => a.date)).toEqual(["2024-07-13", "2025-01-01", "2026-11-30"]);
  });
  test("blank cells preserve existing values and matching dates do not insert", () => {
    const plan = importPlan([{ entry_date: "2024-07-13", size: "", repair_item: "修理" }], [{ id: "old", entry_date: "2024-07-13", size: "維持" }], "2024-07-13", "2026-11-30");
    expect(plan.actions).toEqual([{ date: "2024-07-13", id: "old", fields: { repair_item: "修理" } }]);
  });
  test("unchanged data is counted separately", () => {
    expect(importPlan([{ entry_date: "2024-07-13", size: "維持" }], [{ id: "a", entry_date: "2024-07-13", size: "維持" }], "2024-07-13", "2026-11-30").skipped).toBe(1);
  });
  test("all 3176 rows are fetched instead of only the first 1000", async () => {
    const all = Array.from({ length: 3176 }, (_, i) => i);
    expect(await readAllPages(async (from, to) => ({ data: all.slice(from, to + 1), error: null }))).toEqual(all);
  });
  test("fetch errors cannot be reported as success", async () => {
    await expect(readAllPages(async () => ({ data: null, error: { message: "Denied" } }))).rejects.toThrow("Denied");
  });
  test("row 3 A-H mapping and actual serial year are preserved", async () => {
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([["title"], ["headers"], [45486, "土", "C", "D", "E", "F", "G", "H"], [45658, "水", "next year"]]);
    sheet.A3.z = "m/d"; sheet.A4.z = "m/d";
    XLSX.utils.book_append_sheet(wb, sheet, "diary24");
    const file = new File([XLSX.write(wb, { type: "array", bookType: "xlsx" })], "三条工場申し送りFile.xlsx");
    const result = await inspectScheduleExcel(file);
    expect(result.rows).toEqual([{ entry_date: "2024-07-13", size: "C", comment_category: "D", operation_comment: "E", repair_item: "F", new_effort: "G", personal_plan: "H" }]);
    expect(result.sheets[0]?.outsideYear).toBe(1);
  });
});