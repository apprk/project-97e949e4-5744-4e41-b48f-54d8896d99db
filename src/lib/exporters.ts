import * as XLSX from "xlsx";

/** 申し送りFileの列順（既存Excelフォーマットを変更しない） */
export const DIARY_HEADERS = [
  "ｻｲｽﾞ",
  "ｺﾒﾝﾄ分類",
  "操業ｺﾒﾝﾄ／出来事のﾎﾟｲﾝﾄ",
  "故障/運休状況/修理項目",
  "新たな取組/MY/次回確認",
  "品質",
] as const;

export type ScheduleRow = {
  entry_date: string;
  size: string | null;
  comment_category: string | null;
  operation_comment: string | null;
  repair_item: string | null;
  new_effort: string | null;
  quality: string | null;
  personal_plan?: string | null;
};

const cell = (v: string | null | undefined) => v ?? "";

function diarySheet(rows: ScheduleRow[], year: number) {
  const aoa: (string | number)[][] = [[`日時${year}`, ...DIARY_HEADERS]];
  rows
    .filter((r) => new Date(r.entry_date).getFullYear() === year)
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
    .forEach((r) => {
      aoa.push([
        r.entry_date,
        cell(r.size),
        cell(r.comment_category),
        cell(r.operation_comment),
        cell(r.repair_item),
        cell(r.new_effort),
        cell(r.quality),
      ]);
    });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 44 }, { wch: 32 }, { wch: 32 }, { wch: 32 }];
  return ws;
}

/** 既存フォーマット（年ごとの diaryNN シート）でExcel出力 */
export function exportScheduleExcel(rows: ScheduleRow[], fileName = "三条工場申し送りFile.xlsx") {
  const years = [...new Set(rows.map((r) => new Date(r.entry_date).getFullYear()))].sort();
  const wb = XLSX.utils.book_new();
  if (years.length === 0) years.push(new Date().getFullYear());
  years.forEach((y) => {
    XLSX.utils.book_append_sheet(wb, diarySheet(rows, y), `diary${String(y).slice(2)}`);
  });
  XLSX.writeFile(wb, fileName);
}

/** 申し送りFile読込用：許可ファイル名 */
export const IMPORT_FILE_NAME = "三条工場申し送りFile.xlsx";

export type ImportedRow = {
  entry_date: string;
  size?: string;
  comment_category?: string;
  operation_comment?: string;
  repair_item?: string;
  new_effort?: string;
  quality?: string;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

function toDateString(v: unknown): string | null {
  if (v instanceof Date) return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
  const s = String(v ?? "").trim();
  const m = s.match(/(\d{4})[/年.-](\d{1,2})[/月.-](\d{1,2})/);
  if (m) return `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}`;
  return null;
}

const KEYMAP: { key: keyof ImportedRow; test: RegExp }[] = [
  { key: "size", test: /ｻｲｽﾞ|サイズ/ },
  { key: "comment_category", test: /ｺﾒﾝﾄ分類|コメント分類/ },
  { key: "operation_comment", test: /操業/ },
  { key: "repair_item", test: /修理|故障|運休/ },
  { key: "new_effort", test: /新た|取組|次回|MY/ },
  { key: "quality", test: /品質/ },
];

/** 「三条工場申し送りFile.xlsx」を読み込み、日付ごとの入力値を返す */
export async function parseScheduleExcel(file: File): Promise<ImportedRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true });
  const out: ImportedRow[] = [];
  wb.SheetNames.forEach((name) => {
    const ws = wb.Sheets[name];
    if (!ws) return;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
    let colMap: Partial<Record<keyof ImportedRow, number>> = {};
    let dateCol = 0;
    aoa.forEach((row) => {
      if (!row) return;
      const texts = row.map((c) => String(c ?? "").trim());
      const isHeader = texts.some((t) => /ｻｲｽﾞ|サイズ/.test(t)) || texts.some((t) => /ｺﾒﾝﾄ分類|コメント分類/.test(t));
      if (isHeader) {
        colMap = {};
        texts.forEach((t, i) => {
          if (/日時|日付/.test(t)) dateCol = i;
          KEYMAP.forEach((k) => {
            if (colMap[k.key] === undefined && t && k.test.test(t)) colMap[k.key] = i;
          });
        });
        return;
      }
      const date = toDateString(row[dateCol]);
      if (!date) return;
      const rec: ImportedRow = { entry_date: date };
      let has = false;
      (Object.keys(colMap) as (keyof ImportedRow)[]).forEach((k) => {
        if (k === "entry_date") return;
        const idx = colMap[k];
        if (idx === undefined) return;
        const val = String(row[idx] ?? "").trim();
        if (val) {
          rec[k] = val;
          has = true;
        }
      });
      if (has) out.push(rec);
    });
  });
  return out;
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
