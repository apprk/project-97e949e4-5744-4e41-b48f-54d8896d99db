import { supabase } from "@/integrations/supabase/client";
import type { Purchase } from "@/lib/purchases";

/** Permission-aware projection; restricted supplier/number values never reach the browser. */
export async function fetchPurchaseRows(): Promise<Purchase[]> {
  const { data, error } = await supabase.rpc("purchase_rows");
  if (error) throw error;
  const rows=(data ?? []) as unknown as Purchase[];
  return rows.sort((a,b)=>a.written_on.localeCompare(b.written_on) || a.created_at.localeCompare(b.created_at));
}