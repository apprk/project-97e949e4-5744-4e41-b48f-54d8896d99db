import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** 物品購入の添付写真の表示用URL（閲覧できる購入データの添付のみ） */
export const signAttachments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ids: z.array(z.string().uuid()).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.ids.length === 0) return {} as Record<string, string>;
    // 利用者本人の権限（RLS）で見える添付だけに絞る
    const { data: rows } = await context.supabase
      .from("purchase_attachments")
      .select("id,storage_path")
      .in("id", data.ids)
      .is("deleted_at", null);
    if (!rows?.length) return {} as Record<string, string>;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed } = await supabaseAdmin.storage
      .from("photos")
      .createSignedUrls(rows.map((r) => r.storage_path), 3600);
    const out: Record<string, string> = {};
    rows.forEach((r, i) => {
      const u = signed?.[i]?.signedUrl;
      if (u) out[r.id] = u;
    });
    return out;
  });
