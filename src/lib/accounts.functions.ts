import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: `sanjo-${data.pin}` });
    if (error) throw new Error("変更に失敗しました");
    await supabaseAdmin.from("account_pins").upsert({ user_id: data.userId, pin: data.pin, updated_at: new Date().toISOString() });
    return { ok: true };
  });
