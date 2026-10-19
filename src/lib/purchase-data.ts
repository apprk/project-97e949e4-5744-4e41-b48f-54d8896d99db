import { supabase } from "@/integrations/supabase/client";
import type { Purchase } from "@/lib/purchases";

/** Permission-aware projection; restricted supplier/number values never reach the browser. */
export async function fetchPurchaseRows(): Promise<Purchase[]> {
  const { data, error } = await supabase.rpc("purchase_rows");
  if (error) throw error;
  return (data ?? []) as unknown as Purchase[];
}