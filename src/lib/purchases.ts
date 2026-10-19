export type PurchaseStatus = "pending" | "approved" | "rejected" | "needs_check" | "checked" | "delivered";

export type Purchase = {
  estimate_no?: string | null;
  inspection_no?: string | null;
  vendor_no?: string | null;
  id: string;
  user_id: string;
  workplace: string | null;
  written_on: string;
  writer: string;
  item_name: string;
  model: string | null;
  note: string | null;
  quantity: number | null;
  unit: string | null;
  status: PurchaseStatus;
  supplier: string | null;
  delivered_on: string | null;
  amount: number | null;
  check_reason: string | null;
  created_at: string;
};

export type Writer = { id: string; name: string; kana: string };

export const STATUS: Record<PurchaseStatus, { icon: string; label: string }> = {
  pending: { icon: "🟡", label: "申請中" },
  approved: { icon: "🟢", label: "承認済" },
  rejected: { icon: "🔴", label: "却下" },
  needs_check: { icon: "🟠", label: "要確認" },
  checked: { icon: "✅", label: "確認済" },
  delivered: { icon: "🔵", label: "納品済" },
};

export const statusText = (s: PurchaseStatus) => `${STATUS[s].icon} ${STATUS[s].label}`;

/** 小計 = 単価 × 数量 */
export const subtotal = (p: Pick<Purchase, "amount" | "quantity">) =>
  p.amount == null || p.quantity == null ? null : Math.round(Number(p.amount) * Number(p.quantity) * 100) / 100;

/** Web検索キーワード（品名 型式） */
export const searchWords = (p: { item_name?: string | null; model?: string | null }) =>
  [p.item_name?.trim(), p.model?.trim()].filter(Boolean).join(" ");

/** 目安納期 = 納品日 − 記載日（日数） */
export function leadDays(p: Pick<Purchase, "written_on" | "delivered_on">): number | null {
  if (!p.delivered_on) return null;
  const a = Date.parse(p.written_on + "T00:00:00Z");
  const b = Date.parse(p.delivered_on + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}

export const fmtMD = (d: string | null) => {
  if (!d) return "";
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
};
export const fmtYMD = (d: string | null) => (d ? d.replace(/-/g, "/") : "");
export const fmtYen = (n: number | null) => (n == null ? "" : `${Number(n).toLocaleString("ja-JP")}円`);
export const fmtNum = (n: number | null) => (n == null ? "" : String(Number(n)));

/** ひらがな・カタカナを同一視して比較 */
export const toHira = (s: string) =>
  s.normalize("NFKC").replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).toLowerCase();

export const normalizePurchaseText = (s: string) => s.normalize("NFKC").toLocaleLowerCase("ja");
export const purchaseTextIncludes = (s: string | null | undefined, q: string) => normalizePurchaseText(s ?? "").includes(normalizePurchaseText(q));
export const comparePurchaseText = (a: string, b: string) => normalizePurchaseText(a).localeCompare(normalizePurchaseText(b), "ja");

export function inspectionMatches(status: PurchaseStatus, number: string, withDelivered = true, numberFilter = "all") {
  return (status === "approved" || (withDelivered && status === "delivered")) &&
    (numberFilter === "all" || (numberFilter === "numbered" ? !!number.trim() : !number.trim()));
}

export function workplaceChangeAllowed(canEdit: boolean, canBlank: boolean, next: string) {
  return canEdit && (!!next.trim() || canBlank);
}

export const initialPurchaseWorkplace = (isAdmin: boolean, workplace?: string | null) => isAdmin ? "" : workplace ?? "";

/** A supplier change must retain the number freshly resolved by the database. */
export const preserveDerivedVendor = (isNew: boolean, previous: string | null | undefined, next: string) =>
  isNew || (previous ?? "").trim() !== next.trim();

export function matchWriters(writers: Writer[], q: string) {
  const k = toHira(q.trim());
  if (!k) return [];
  return writers.filter((w) => toHira(w.kana).startsWith(k) || w.name.startsWith(q.trim())).slice(0, 8);
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/** タブ区切り。空欄も位置を保持する（改行・タブは空白へ） */
export const toTsv = (cells: string[]) => cells.map((c) => c.replace(/[\t\r\n]+/g, " ")).join("\t");

/** 表の枠：画面の高さに収め、横スクロールバーを常に画面下側に表示する（見出しは上に固定） */
export const TABLE_SCROLL = "max-h-[calc(100dvh-11rem)] overflow-auto overscroll-contain rounded-xl border border-border bg-card";
