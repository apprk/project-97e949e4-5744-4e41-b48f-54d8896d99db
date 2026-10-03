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
    ],
  },
  { key: "equipment", to: "/equipment", label: "設備保全", icon: Wrench },
];

export const ALL_PERMS: string[] = MODES.flatMap((m) => [m.key, ...(m.perms ?? []).map((p) => p.key)]);

export const GATE_TOKEN_KEY = "sanjo.gate.token";
export const getGateToken = () => (typeof window === "undefined" ? null : localStorage.getItem(GATE_TOKEN_KEY));
