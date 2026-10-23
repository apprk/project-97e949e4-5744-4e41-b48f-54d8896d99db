import { supabase } from "@/integrations/supabase/client";

export type EquipmentAccount = { id: string; name: string };
export function equipmentReadOnly(actor: string, target: string, admin: boolean) {
  return actor !== target && !admin;
}
export async function assertNormalMode(client: { rpc: (fn: "equipment_view_active") => PromiseLike<{ data: unknown; error: unknown }> }) {
  const { data, error } = await client.rpc("equipment_view_active");
  if (error || data === true) throw new Error("設備管理の切替を解除してください");
}
export async function equipmentView() {
  const [accounts, target] = await Promise.all([
    supabase.rpc("equipment_accounts"), supabase.rpc("equipment_view_target"),
  ]);
  if (accounts.error || target.error) throw accounts.error ?? target.error;
  return { accounts: accounts.data as unknown as EquipmentAccount[], target: target.data };
}