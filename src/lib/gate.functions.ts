import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const DEFAULT_ID = "hokume0624";
const DEFAULT_PASS = "hokume0624";

function hashPass(pass: string, salt: string) {
  return pbkdf2Sync(pass, salt, 50000, 32, "sha256").toString("hex");
}
function safeEq(a: string, b: string) {
  const x = createHmac("sha256", "cmp").update(a).digest();
  const y = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(x, y);
}
function tokenFor() {
  const secret = process.env["GATE_SECRET"];
  if (!secret) throw new Error("GATE_SECRET missing");
  return createHmac("sha256", secret).update("sanjo-gate-v1").digest("hex");
}
function tokenValid(token: string | undefined | null) {
  if (!token) return false;
  return safeEq(token, tokenFor());
}

async function loadGate() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("app_gate").select("*").eq("id", 1).maybeSingle();
  if (data) return data;
  const salt = randomBytes(16).toString("hex");
  const row = { id: 1, login_id: DEFAULT_ID, pass_salt: salt, pass_hash: hashPass(DEFAULT_PASS, salt) };
  await supabaseAdmin.from("app_gate").upsert(row);
  return row;
}

export const unlockGate = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().max(100), pass: z.string().max(200) }).parse(d))
  .handler(async ({ data }) => {
    const gate = await loadGate();
    const ok = safeEq(data.id, gate.login_id) && safeEq(hashPass(data.pass, gate.pass_salt), gate.pass_hash);
    if (!ok) return { ok: false as const, token: null };
    return { ok: true as const, token: tokenFor() };
  });

export const checkGate = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().max(200).nullable() }).parse(d))
  .handler(async ({ data }) => ({ ok: tokenValid(data.token) }));

/** 初期認証済み端末のみアカウント一覧を返す */
export const listAccounts = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().max(200).nullable() }).parse(d))
  .handler(async ({ data }) => {
    if (!tokenValid(data.token)) return { ok: false as const, accounts: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.from("profiles").select("id,name,slug").order("created_at");
    return { ok: true as const, accounts: rows ?? [] };
  });

export const getGateId = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin } = await context.supabase.rpc("is_admin");
    if (!admin) throw new Error("Forbidden");
    const gate = await loadGate();
    return { id: gate.login_id };
  });

export const updateGate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().trim().min(4).max(100), pass: z.string().min(6).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("is_admin");
    if (!admin) throw new Error("Forbidden");
    await loadGate();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const salt = randomBytes(16).toString("hex");
    const { error } = await supabaseAdmin
      .from("app_gate")
      .update({ login_id: data.id, pass_salt: salt, pass_hash: hashPass(data.pass, salt), updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error("更新に失敗しました");
    return { ok: true };
  });
