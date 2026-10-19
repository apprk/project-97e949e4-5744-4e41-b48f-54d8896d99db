import { CalendarDays, Camera, ShoppingCart, Wrench, type LucideIcon } from "lucide-react";

/**
 * 業務モード一覧。新しいモードはここに1行追加し、ルートを作成するだけで
 * ホーム表示・アカウント別の利用設定に自動で反映される。
 * perms はモード内の細かい権限（"モード.操作" のキーで account_modes に保存）。
 */
export type ModeKey = "schedule" | "photos" | "purchases" | "equipment";

export type Perm = { key: string; label: string };

export const MODES: { key: ModeKey; to: string; label: string; icon: LucideIcon; perms?: Perm[] }[] = [
  { key: "schedule", to: "/schedule", label: "スケジュール", icon: CalendarDays },
  { key: "photos", to: "/photos", label: "写真", icon: Camera },
  {
    key: "purchases",
    to: "/purchases",
    label: "物品購入",
    icon: ShoppingCart,
    perms: [
      { key: "purchases.entry", label: "記入" },
      { key: "purchases.history", label: "履歴を見る" },
      { key: "purchases.all_workplaces", label: "全職場の履歴を見る" },
      { key: "purchases.settings", label: "物品購入設定モード利用可" },
      { key: "purchases.workplace_edit", label: "職場修正可" },
      { key: "purchases.workplace_blank", label: "職場欄空白化" },
      { key: "purchases.estimate", label: "見積書欄表示・記入可" },
      { key: "purchases.status", label: "状態操作可" },
      { key: "purchases.fulfillment", label: "発注先・納品日・単価の操作可" },
      { key: "purchases.inspection", label: "発注検収モード利用可" },
      { key: "purchases.transfer", label: "物品購入Excel読込・CSV出力可" },
    ],
  },
  { key: "equipment", to: "/equipment", label: "設備保全", icon: Wrench },
];

/**
 * モード以外の機能・設定の権限（アカウントごとにON/OFF）。
 * 新しい機能はここに1行追加すると、設定のアカウント一覧に自動で出る。
 * 権限の変更自体は管理者のみ（account_modes の書き込みは管理者限定）。
 */
export const FEATURES: Perm[] = [
  { key: "settings", label: "設定（パスワード変更・省略設定）" },
  { key: "trash", label: "ごみ箱" },
  { key: "accounts.manage", label: "アカウント管理（追加）" },
  { key: "accounts.list", label: "アカウント一覧（閲覧）" },
  { key: "gate", label: "初期認証の変更" },
];

export const ALL_PERMS: string[] = [...MODES.flatMap((m) => [m.key, ...(m.perms ?? []).map((p) => p.key)]), ...FEATURES.map((f) => f.key)];

export const GATE_TOKEN_KEY = "sanjo.gate.token";
export const getGateToken = () => (typeof window === "undefined" ? null : localStorage.getItem(GATE_TOKEN_KEY));
