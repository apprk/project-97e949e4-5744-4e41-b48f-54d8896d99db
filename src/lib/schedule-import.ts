import type { ImportedRow, ScheduleField } from "./exporters";

export const SCHEDULE_FIELDS: ScheduleField[] = ["size", "comment_category", "operation_comment", "repair_item", "new_effort", "personal_plan"];
export type StoredSchedule = { id: string; entry_date: string } & Partial<Record<ScheduleField, string | null>>;

/** Small pages stay below the Data API cap; never treat errors as end-of-data. */
export async function readAllPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const result = await fetchPage(from, from + 499);
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error("取得結果がありません");
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
}

export function importPlan(source: ImportedRow[], existing: StoredSchedule[], start: string, end: string) {
  const byDate = new Map<string, StoredSchedule>();
  let duplicateExisting = 0;
  for (const row of existing) {
    if (byDate.has(row.entry_date)) duplicateExisting += 1;
    else byDate.set(row.entry_date, row);
  }
  const dates = new Set<string>();
  const actions: { date: string; id?: string; fields: Partial<Record<ScheduleField, string>> }[] = [];
  let skipped = 0;
  const target = source.filter(row => row.entry_date >= start && row.entry_date <= end);
  for (const row of target) {
    if (dates.has(row.entry_date)) throw new Error(`Excelに同じ日付が複数あります：${row.entry_date}`);
    dates.add(row.entry_date);
    const old = byDate.get(row.entry_date);
    const fields: Partial<Record<ScheduleField, string>> = {};
    for (const key of SCHEDULE_FIELDS) {
      const value = row[key];
      if (value?.trim() && value !== old?.[key]) fields[key] = value;
    }
    if (!Object.keys(fields).length) { skipped += 1; continue; }
    actions.push({ date: row.entry_date, ...(old ? { id: old.id } : {}), fields });
  }
  return { actions, skipped, target: target.length, duplicateExisting };
}