import { addDays, addMonths, addWeeks, addYears, format, isValid, parseISO, startOfMonth } from "date-fns";

export type CycleUnit = "year" | "month" | "week";
export type Maintenance = {
  id: string; user_id: string; name: string; repair_content: string; assignee: string | null;
  cycle_value: number | null; cycle_unit: CycleUnit | null; planned_on: string | null;
  stopped: boolean; after_breakdown: boolean; created_at: string;
};
export type Completion = { id: string; equipment_id: string; user_id: string; performed_on: string; comment: string | null; created_at: string };
export type NextTiming = { kind: "date"; date: string; inferred: boolean; planned?: boolean } | { kind: "state"; label: string; inferred: false };
export const normalizeMaintenance = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ja").trim();
export const calendarDate = (value: string | null | undefined) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = parseISO(value);
  return isValid(date) && format(date, "yyyy-MM-dd") === value ? date : null;
};
export const japanToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
export function latestCompletion(history: Pick<Completion, "performed_on">[]) {
  const dates = history.map(h => calendarDate(h.performed_on)).filter(d => d !== null);
  return dates.length ? format(new Date(Math.max(...dates.map(d => d.getTime()))), "yyyy-MM-dd") : null;
}
export function nextTiming(record: Pick<Maintenance, "stopped" | "after_breakdown" | "planned_on" | "cycle_value" | "cycle_unit">, history: Pick<Completion, "performed_on">[], today: string): NextTiming {
  void today; // 予定日の有効性は最終実施日との比較のみで判定し、今日との比較は行わない。
  if (record.stopped || record.after_breakdown) return { kind: "state", label: [record.stopped ? "非表示" : "", record.after_breakdown ? "破損後" : ""].filter(Boolean).join("・"), inferred: false };
  const latest = calendarDate(latestCompletion(history));
  const planned = calendarDate(record.planned_on);
  // 予定日は最終実施日より後（履歴がなければ無条件）なら有効。過去の年月でも次回時期として保持し、未実施分類は月比較に委ねる。
  if (planned && (!latest || planned.getTime() > latest.getTime())) return { kind: "date", date: format(planned, "yyyy-MM-dd"), inferred: false, planned: true };
  if (!latest) return { kind: "state", label: "未定", inferred: false };
  if (record.cycle_value && record.cycle_value > 0 && record.cycle_unit) {
    const calculators = { year: addYears, month: addMonths, week: addWeeks };
    return { kind: "date", date: format(calculators[record.cycle_unit](latest, record.cycle_value), "yyyy-MM-dd"), inferred: false };
  }
  if (!record.cycle_value) {
    const dates = [...new Set(history.map(h => h.performed_on))].map(calendarDate).filter(d => d !== null).sort((a,b) => a.getTime()-b.getTime());
    const first = dates[0];
    const last = dates[dates.length-1];
    if (dates.length >= 2 && first && last) {
      // UTC calendar ordinals avoid daylight-saving differences in day intervals.
      const ordinal = (d: Date) => Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000;
      const average = Math.round((ordinal(last)-ordinal(first))/(dates.length-1));
      return { kind: "date", date: format(addDays(latest, average), "yyyy-MM-dd"), inferred: true };
    }
  }
  return { kind: "state", label: "未定", inferred: false };
}
export function maintenanceMatches(timing: NextTiming, tab: string, today: string, selectedMonth: string) {
  if (tab === "all") return true;
  if (timing.kind !== "date") return false;
  const date = calendarDate(timing.date), now = calendarDate(today);
  if (!date || !now) return false;
  const month = startOfMonth(date).getTime(), current = startOfMonth(now).getTime();
  if (tab === "overdue") return month < current;
  if (tab === "this") return month === current;
  if (tab === "next") return month === addMonths(startOfMonth(now),1).getTime();
  if (tab === "month") return format(date,"yyyy-MM") === selectedMonth;
  if (tab === "plan") return month < current || month <= addMonths(startOfMonth(now),13).getTime();
  return true;
}
export function planMonths(today: string) {
  const now = calendarDate(today);
  return now ? Array.from({length:14},(_,i) => format(addMonths(startOfMonth(now),i),"yyyy-MM")) : [];
}
export function equipmentGroup(name: string, masters: { name: string }[]) {
  return masters.find(m => normalizeMaintenance(m.name) === normalizeMaintenance(name))?.name ?? "その他";
}
export function sortMaintenance(rows: Maintenance[], history: Completion[], today: string, key: string, descending: boolean) {
  const histories = new Map<string,Completion[]>();
  for (const h of history) histories.set(h.equipment_id,[...(histories.get(h.equipment_id) ?? []),h]);
  const value = (r: Maintenance): number | null => {
    if (key === "created") return new Date(r.created_at).getTime();
    const own = histories.get(r.id) ?? [];
    const timing = nextTiming(r,own,today);
    const date = key === "latest" ? latestCompletion(own) : timing.kind === "date" ? timing.date : null;
    return calendarDate(date)?.getTime() ?? null;
  };
  return [...rows].sort((a,b) => {
    let result = 0;
    if (key === "repair") result = normalizeMaintenance(a.repair_content).localeCompare(normalizeMaintenance(b.repair_content),"ja");
    else {
      const av=value(a),bv=value(b);
      if (av === null && bv !== null) return 1;
      if (bv === null && av !== null) return -1;
      result=(av ?? 0)-(bv ?? 0);
    }
    return (descending ? -result : result) || a.id.localeCompare(b.id);
  });
}