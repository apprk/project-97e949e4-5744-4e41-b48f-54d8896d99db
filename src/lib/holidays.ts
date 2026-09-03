/** 日本の祝日判定（内閣府の規則に基づく簡易計算。振替休日・国民の休日も対応） */

const pad = (n: number) => String(n).padStart(2, "0");
const key = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** n番目の指定曜日（ハッピーマンデー用） */
function nthWeekday(year: number, month: number, weekday: number, nth: number) {
  const first = new Date(year, month - 1, 1).getDay();
  const day = 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7;
  return day;
}

function equinox(year: number, spring: boolean) {
  const base = spring ? 20.8431 : 23.2488;
  return Math.floor(base + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

const cache = new Map<number, Set<string>>();

function holidaysOf(year: number): Set<string> {
  const cached = cache.get(year);
  if (cached) return cached;
  const base: string[] = [
    key(year, 1, 1),
    key(year, 1, nthWeekday(year, 1, 1, 2)), // 成人の日
    key(year, 2, 11),
    key(year, 2, 23), // 天皇誕生日
    key(year, 3, equinox(year, true)),
    key(year, 4, 29),
    key(year, 5, 3),
    key(year, 5, 4),
    key(year, 5, 5),
    key(year, 7, nthWeekday(year, 7, 1, 3)), // 海の日
    key(year, 8, 11),
    key(year, 9, nthWeekday(year, 9, 1, 3)), // 敬老の日
    key(year, 9, equinox(year, false)),
    key(year, 10, nthWeekday(year, 10, 1, 2)), // スポーツの日
    key(year, 11, 3),
    key(year, 11, 23),
  ];
  const set = new Set(base);
  // 国民の休日（敬老の日と秋分の日に挟まれた平日）
  const respect = nthWeekday(year, 9, 1, 3);
  const autumn = equinox(year, false);
  if (autumn - respect === 2) set.add(key(year, 9, respect + 1));
  // 振替休日
  base.forEach((k) => {
    const d = new Date(k + "T00:00:00");
    if (d.getDay() !== 0) return;
    do {
      d.setDate(d.getDate() + 1);
    } while (set.has(key(d.getFullYear(), d.getMonth() + 1, d.getDate())));
    set.add(key(d.getFullYear(), d.getMonth() + 1, d.getDate()));
  });
  cache.set(year, set);
  return set;
}

export function isHoliday(date: string) {
  return holidaysOf(Number(date.slice(0, 4))).has(date);
}

/** 土日祝の既定判定 */
export function isDefaultGray(date: string) {
  const wd = new Date(date + "T00:00:00").getDay();
  return wd === 0 || wd === 6 || isHoliday(date);
}
