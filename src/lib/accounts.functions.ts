import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d)=>z.object({name:z.string().trim().min(1).max(100),slug:z.string().regex(/^[a-z0-9_-]{2,20}$/),pin:z.string().regex(/^\d{4}$/)}).parse(d))
  .handler(async ({data,context})=>{
    const {data:allowed,error:permissionError}=await context.supabase.rpc("has_perm",{_perm:"accounts.manage"});
    if(permissionError || !allowed)throw new Error("Forbidden");
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const {data:created,error}=await supabaseAdmin.auth.admin.createUser({email:`${data.slug}@sanjo.local`,password:`sanjo-${data.pin}`,email_confirm:true,user_metadata:{name:data.name,slug:data.slug}});
    if(error || !created.user)throw new Error("追加に失敗しました（IDが重複している可能性があります）");
    const {error:pinError}=await supabaseAdmin.from("account_pins").upsert({user_id:created.user.id,pin:data.pin});
    if(pinError)throw new Error("アカウントを追加しましたが、パスワード一覧への記録に失敗しました");
    return {ok:true};
  });

async function assertAdmin(supabase: { rpc: (fn: "is_admin") => PromiseLike<{ data: unknown }> }) {
  const { data } = await supabase.rpc("is_admin");
  if (!data) throw new Error("Forbidden");
}

/** 一般アカウントの削除（ログイン不可にして一覧から外す。過去データは保持） */
export const disableAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId);
    if (roles?.some((r) => r.role === "admin")) throw new Error("管理者アカウントは削除できません");
    await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: "876000h" });
    await supabaseAdmin.from("profiles").update({ disabled_at: new Date().toISOString() }).eq("id", data.userId);
    await supabaseAdmin.from("account_modes").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("account_pins").delete().eq("user_id", data.userId);
    return { ok: true };
  });

/** 管理者による4桁パスワード再設定 */
export const resetAccountPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), pin: z.string().regex(/^\d{4}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {data:roles}=await supabaseAdmin.from("user_roles").select("role").eq("user_id",data.userId);
    if(roles?.some((r)=>r.role==="admin"))throw new Error("管理者のパスワードは専用の変更画面で変更してください");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: `sanjo-${data.pin}` });
    if (error) throw new Error("変更に失敗しました");
    await supabaseAdmin.from("account_pins").upsert({ user_id: data.userId, pin: data.pin, updated_at: new Date().toISOString() });
    return { ok: true };
  });
