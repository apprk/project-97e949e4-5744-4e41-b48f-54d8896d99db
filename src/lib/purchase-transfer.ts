import * as XLSX from "xlsx";

export const PURCHASE_FILENAME = "物品購入依頼表_(三条）’2021.04～.xlsx";
export type ImportPurchase = {
  written_on: string; writer: string; item_name: string; model: string; note: string;
  quantity: number | null; unit: string; supplier: string; estimate_no: string;
  delivered_on: string | null; amount: number | null;
};
export function inPurchasePeriod(date: string, from = "", to = "") {
  return (!from || date >= from) && (!to || date <= to);
}
export function validatePurchaseFile(name: string) {
  if (name !== PURCHASE_FILENAME) throw new Error(`対象ファイル名が異なります。${PURCHASE_FILENAME} を選択してください。`);
}
function dateCell(value: unknown): string | null {
  if (typeof value === "number") {
    const d = XLSX.SSF.parse_date_code(value);
    return d ? `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}` : null;
  }
  if (value instanceof Date) return value.toISOString().slice(0,10);
  const match = String(value ?? "").trim().match(/^(\d{4})[\/年.-](\d{1,2})[\/月.-](\d{1,2})日?$/);
  if (!match) return null;
  const s = `${match[1]}-${String(match[2]).padStart(2,"0")}-${String(match[3]).padStart(2,"0")}`;
  const d = new Date(s + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === s ? s : null;
}
const numeric = (value: unknown) => {
  const s = String(value ?? "").replace(/[,円\s]/g, "");
  return s && Number.isFinite(Number(s)) ? Number(s) : null;
};
export function parsePurchaseSheet(grid: unknown[][], from = "", to = ""): ImportPurchase[] {
  return grid.slice(6).flatMap((r) => {
    const written_on = dateCell(r[2]);
    const t = (i: number) => String(r[i] ?? "").trim();
    if (!written_on || !t(4) || !inPurchasePeriod(written_on,from,to)) return [];
    const estimate = t(17);
    if (estimate && !/^\d{1,3}$/.test(estimate)) throw new Error("見積書は3桁以内の数字である必要があります。");
    return [{ written_on, writer:t(3), item_name:t(4), model:[t(5),t(6),t(7)].filter(Boolean).join(" "),
      quantity:numeric(r[8]), unit:t(9), note:t(10), supplier:t(12), estimate_no:estimate,
      delivered_on:dateCell(r[25]), amount:numeric(r[26]) }];
  });
}
export function parsePurchaseWorkbook(bytes: ArrayBuffer | Uint8Array, from = "", to = "") {
  const book = XLSX.read(bytes,{type:"array"});
  return book.SheetNames.flatMap((name) => {
    const sheet = book.Sheets[name];
    return sheet ? parsePurchaseSheet(XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:"",blankrows:true,range:0}),from,to) : [];
  });
}
export const PURCHASE_CSV_HEADERS = (() => {
  const r = Array<string>(27).fill("");
  for (const [i,label] of [[2,"記載日"],[3,"記載者"],[4,"品名"],[5,"型式"],[8,"数量"],[9,"単位"],[10,"備考"],[12,"発注先"],[17,"見積書"],[25,"納品日"],[26,"単価"]] as const) r[i]=label;
  return r;
})();
export function purchaseCsvCells(r: Omit<ImportPurchase,"estimate_no"> & { estimate_no?: string | null }) {
  const out = Array<string>(27).fill("");
  out[2]=r.written_on; out[3]=r.writer; out[4]=r.item_name; out[5]=r.model ?? "";
  out[8]=r.quantity == null ? "" : String(r.quantity); out[9]=r.unit ?? ""; out[10]=r.note ?? "";
  out[12]=r.supplier ?? ""; out[17]=r.estimate_no ?? ""; out[25]=r.delivered_on ?? ""; out[26]=r.amount == null ? "" : String(r.amount);
  return out;
}
export const purchaseCsv = (rows: Parameters<typeof purchaseCsvCells>[0][]) =>
  "\ufeff" + [PURCHASE_CSV_HEADERS,...rows.map(purchaseCsvCells)].map((r) => r.map((c) => `"${c.replace(/"/g,'""')}"`).join(",")).join("\r\n");