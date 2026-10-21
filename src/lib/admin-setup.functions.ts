import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { adminSetupSchema, initialSetupAllowed } from "./admin-setup";

export const firstAdminSetupStatus = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ token: z.string().max(200).nullable() }).parse(input))
  .handler(async ({ data }) => {
    if (!initialSetupAllowed(process.env["ALLOW_INITIAL_ADMIN_SETUP"], false, false)) return { available: false };
    const { verifyDeviceToken } = await import("./admin-auth.server");
    verifyDeviceToken(data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: available, error } = await supabaseAdmin.rpc("first_admin_setup_available");
    if (error) throw new Error("初回設定を確認できませんでした");
    return { available: available === true };
  });

export const completeFirstAdminSetup = createServerFn({ method: "POST" })
  .inputValidator((input) => adminSetupSchema.parse(input))
  .handler(async ({ data }) => {
    if (!initialSetupAllowed(process.env["ALLOW_INITIAL_ADMIN_SETUP"], false, false)) throw new Error("初回設定は利用できません");
    const { verifyDeviceToken, passwordClient, sessionId } = await import("./admin-auth.server");
    verifyDeviceToken(data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const claim = crypto.randomUUID();
    const { data: claimed, error: claimError } = await supabaseAdmin.rpc("claim_first_admin_setup", { _claim: claim });
    if (claimError || claimed !== true) throw new Error("初回設定は開始済み、または完了しています");
    let createdId: string | null = null;
    let completed = false;
    let finalizing = false;
    const client = passwordClient();
    try {
      const email = `${data.slug}@sanjo.local`;
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email, password: data.password, email_confirm: true,
        user_metadata: { slug: data.slug, name: "管理者", workplace: "" },
      });
      if (error || !created.user) throw new Error("このIDで登録できませんでした。別のIDをお試しください");
      createdId = created.user.id;
      const { data: login, error: loginError } = await client.auth.signInWithPassword({ email, password: data.password });
      if (loginError || !login.session) throw new Error("初回設定の認証に失敗しました");
      finalizing = true;
      const { data: saved, error: saveError } = await supabaseAdmin.rpc("finish_first_admin_setup", {
        _claim: claim, _user: createdId, _session: sessionId(login.session.access_token),
      });
      if (saveError || saved !== true) throw new Error("初回設定を保存できませんでした");
      completed = true;
      return { session: { access_token: login.session.access_token, refresh_token: login.session.refresh_token }, days: 0 };
    } finally {
      // Only a user created by this exact failed attempt can be removed.
      // A completed claim stays permanently closed, even if roles are later removed.
      // A lost finalize response may already have committed: never delete that user.
      if (!completed && !finalizing) {
        let cleaned = true;
        if (createdId) {
          const { error } = await supabaseAdmin.auth.admin.deleteUser(createdId);
          cleaned = !error;
        }
        if (cleaned) await supabaseAdmin.rpc("release_first_admin_setup", { _claim: claim });
      }
    }
  });