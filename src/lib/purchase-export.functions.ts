import { assertNormalMode } from "@/lib/equipment-view";
import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {inPurchasePeriod,purchaseCsv} from "@/lib/purchase-transfer";
import type {Purchase} from "@/lib/purchases";
export const exportPurchaseCsv=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
 .inputValidator((d)=>z.object({from:z.string(),to:z.string()}).parse(d))
 .handler(async({data,context})=>{
    await assertNormalMode(context.supabase);
  const {data:allowed}=await context.supabase.rpc("has_perm",{_perm:"purchases.transfer"});
  if(!allowed)throw new Error("CSV出力の権限がありません");
  if(data.from && data.to && data.from>data.to)throw new Error("開始日は終了日以前にしてください");
  const {data:rows,error}=await context.supabase.rpc("purchase_rows");
  if(error)throw new Error("データを取得できませんでした");
  const permitted=(rows as unknown as Purchase[]).filter(r=>inPurchasePeriod(r.written_on,data.from,data.to));
  return {csv:purchaseCsv(permitted.map(r=>({...r,model:r.model ?? "",note:r.note ?? "",unit:r.unit ?? "",supplier:r.supplier ?? ""})))};
 });