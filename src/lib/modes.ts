import { CalendarDays, Camera, ShoppingCart, Wrench, type LucideIcon } from "lucide-react";

/**
 * 業務モード一覧。新しいモードはここに1行追加し、ルートを作成するだけで
 * ホーム表示・アカウント別の利用設定に自動で反映される。
 */
export type ModeKey = "schedule" | "photos" | "purchases" | "equipment";

export const MODES: { key: ModeKey; to: string; label: string; icon: LucideIcon }[] = [
  { key: "schedule", to: "/schedule", label: "スケジュール", icon: CalendarDays },
  { key: "photos", to: "/photos", label: "写真", icon: Camera },
  { key: "purchases", to: "/purchases", label: "物品購入", icon: ShoppingCart },
  { key: "equipment", to: "/equipment", label: "設備保全", icon: Wrench },
];

export const GATE_TOKEN_KEY = "sanjo.gate.token";
export const getGateToken = () => (typeof window === "undefined" ? null : localStorage.getItem(GATE_TOKEN_KEY));
