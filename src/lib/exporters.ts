import * as XLSX from "xlsx";

/**
 * 申し送りFileの列構成（A〜H列）。この対応関係を入出力で共通に使う。
 * A:日付 B:曜日 C:サイズ D:コメント分類 E:操業コメント F:修理項目 G:その他予定 H:個人予定
 */
export const FIELD_BY_COLUMN = [
  null, // A 日付
  null, // B 曜日
  "size",
  "comment_category",
  "operation_comment",
  "repair_item",
  "new_effort",
  "personal_plan",
] as const;

export type ScheduleField = Exclude<(typeof FIELD_BY_COLUMN)[number], null>;

export const DIARY_HEADERS = [
  "日付",
  "曜日",
  "サイズ",
  "コメント分類",
  "操業コメント",
  "修理項目",
  "その他予定",
  "個人予定",
] as const;

export type ScheduleRow = {
  entry_date: string;
  size?: string | null;
  comment_category?: string | null;
  operation_comment?: string | null;
  repair_item?: string | null;
  new_effort?: string | null;
  personal_plan?: string | null;
};

/** インポート対象の最小年度（diary22 = 2022年） */
export const IMPORT_MIN_YEAR = 2022;
/** 読込を許可するファイル名 */
export const IMPORT_FILE_NAME = "三条工場申し送りFile.xlsx";
/** データ開始行（0始まり。3行目＝index 2） */
const DATA_START_ROW = 2;

const pad2 = (n: number) => String(n).padStart(2, "0");
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const cell = (v: string | null | undefined) => v ?? "";

function daysOfYear(year: number) {
  const out: string[] = [];
  const d = new Date(year, 0, 1);
  while (d.getFullYear() === year) {
    out.push(`${year}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** 1年分のシート（3行目＝1月1日、以降1日ずつ） */
function diarySheet(rows: ScheduleRow[], year: number) {
  const map = new Map<string, ScheduleRow>();
  rows.forEach((r) => {
    if (r.entry_date.startsWith(String(year))) map.set(r.entry_date, r);
  });
  const aoa: (string | number)[][] = [[`三条工場申し送りFile ${year}年`], [...DIARY_HEADERS]];
  daysOfYear(year).forEach((date) => {
    const r = map.get(date);
    const wd = WEEK[new Date(date + "T00:00:00").getDay()]!;
    aoa.push([
      date,
      wd,
      cell(r?.size),
      cell(r?.comment_category),
      cell(r?.operation_comment),
      cell(r?.repair_item),
      cell(r?.new_effort),
      cell(r?.personal_plan),
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 12 },
    { wch: 6 },
    { wch: 10 },
    { wch: 12 },
    { wch: 44 },
    { wch: 32 },
    { wch: 28 },
    { wch: 28 },
  ];
  return ws;
}

/** 既存フォーマット（diaryNN シート）でExcel出力 */
export function exportScheduleExcel(rows: ScheduleRow[], fileName = IMPORT_FILE_NAME) {
  const years = [...new Set(rows.map((r) => Number(r.entry_date.slice(0, 4))))].filter(Boolean).sort();
  if (years.length === 0) years.push(new Date().getFullYear());
  const wb = XLSX.utils.book_new();
  years.forEach((y) => {
    XLSX.utils.book_append_sheet(wb, diarySheet(rows, y), `diary${String(y).slice(2)}`);
  });
  XLSX.writeFile(wb, fileName);
}

export type ImportedRow = { entry_date: string } & Partial<Record<ScheduleField, string>>;

function sheetYear(name: string): number | null {
  const m = name.trim().match(/^diary\s*(\d{2})$/i);
  if (!m) return null;
  return 2000 + Number(m[1]);
}

function toDateString(v: unknown, year: number, date1904 = false): string | null {
  if (typeof v === "number") {
    const parsed = XLSX.SSF.parse_date_code(v, { date1904 });
    return parsed ? `${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}` : null;
  }
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())}`;
  const s = String(v ?? "").trim();
  if (!s) return null;
  const full = s.match(/(\d{4})[/年.-](\d{1,2})[/月.-](\d{1,2})/);
  if (full) return `${full[1]}-${pad2(Number(full[2]))}-${pad2(Number(full[3]))}`;
  const md = s.match(/^(\d{1,2})[/月.-](\d{1,2})/);
  if (md) return `${year}-${pad2(Number(md[1]))}-${pad2(Number(md[2]))}`;
  return null;
}

/**
 * 「三条工場申し送りFile.xlsx」を読み込む。
 * シート名 diaryNN を西暦(20NN)として扱い、3行目以降・A〜H列を固定の対応で取り込む。
 */
export async function inspectScheduleExcel(file: File) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: false });
  const out: ImportedRow[] = [];
  const sheets: { name: string; scanned: number; parsed: number; blank: number; outsideYear: number; errors: string[] }[] = [];
  wb.SheetNames.forEach((name) => {
    const year = sheetYear(name);
    if (year === null || year < IMPORT_MIN_YEAR) return;
    const ws = wb.Sheets[name];
    if (!ws) return;
    const stat = { name, scanned: 0, parsed: 0, blank: 0, outsideYear: 0, errors: [] as string[] };
    sheets.push(stat);
    // Keep actual row numbers and raw date serials: formatted M/D hides the year.
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, range: 0, raw: true, defval: null, blankrows: true });
    const dates = daysOfYear(year);
    for (let i = DATA_START_ROW; i < aoa.length; i += 1) {
      const row = aoa[i];
      if (!row) continue;
      stat.scanned += 1;
      // A列の日付を優先。空欄なら「3行目＝1月1日」の並び順から補完する
      const emptyDate = row[0] === null || row[0] === undefined || row[0] === "";
      const date = emptyDate ? dates[i - DATA_START_ROW] : toDateString(row[0], year, wb.Workbook?.WBProps?.date1904 === true);
      const rec: ImportedRow = { entry_date: date ?? "" };
      FIELD_BY_COLUMN.forEach((field, col) => {
        if (!field) return;
        const address = XLSX.utils.encode_cell({ r: i, c: col });
        const val = String(ws[address] ? XLSX.utils.format_cell(ws[address]) : row[col] ?? "").trim();
        if (val) {
          rec[field] = val;
        }
      });
      if (Object.keys(rec).length === 1) { stat.blank += 1; continue; }
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
        stat.errors.push(`${name} ${i + 1}行目：日付を判定できません`);
        continue;
      }
      if (!date.startsWith(String(year))) { stat.outsideYear += 1; continue; }
      out.push(rec);
      stat.parsed += 1;
    }
  });
  return { rows: out.sort((a, b) => a.entry_date.localeCompare(b.entry_date)), sheets };
}

export async function parseScheduleExcel(file: File): Promise<ImportedRow[]> {
  const result = await inspectScheduleExcel(file);
  const errors = result.sheets.flatMap(sheet => sheet.errors);
  if (errors.length) throw new Error(errors.join("\n"));
  return result.rows;
}

export function exportCsv(headers: string[], rows: (string | number | null | undefined)[][], fileName: string) {
  const esc = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** PDF出力（日本語フォントをそのまま使うため印刷ダイアログ経由でPDF保存） */
export function exportPdf(title: string, headers: string[], rows: (string | null | undefined)[][]) {
  const esc = (s: string | null | undefined) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
 body{font-family:"Noto Sans JP",sans-serif;padding:16px;color:#111}
 h1{font-size:16px;margin:0 0 12px}
 table{border-collapse:collapse;width:100%;font-size:10px}
 th,td{border:1px solid #888;padding:4px 6px;vertical-align:top;text-align:left}
 th{background:#eee}
 @page{size:A4 landscape;margin:10mm}
</style></head><body><h1>${esc(title)}</h1><table><thead><tr>${headers
    .map((h) => `<th>${esc(h)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
