import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const signMaintenancePhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(d => z.object({ ids: z.array(z.string().uuid()).max(200), existing: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: permitted, error: permissionError } = await context.supabase.rpc("has_perm", { _perm: "equipment" });
    if (permissionError || !permitted) throw new Error("Forbidden");
    if (!data.ids.length) return {} as Record<string,string>;
    const query = data.existing
      ? context.supabase.from("photos").select("id,storage_path").in("id",data.ids).is("deleted_at",null)
      : context.supabase.from("equipment_history_attachments").select("id,storage_path,photo_id").in("id",data.ids);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    if (!rows?.length) return {} as Record<string,string>;
    // Only attachment rows already authorized by RLS may resolve their referenced photograph.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Referenced photographs may have been rotated since attachment; follow their current path.
    const paths = new Map(rows.map(r => [r.id,r.storage_path]));
    if (!data.existing) {
      const photoIds = rows.flatMap(r => "photo_id" in r && typeof r.photo_id === "string" ? [r.photo_id] : []);
      if (photoIds.length) {
        const { data: photos, error: photoError } = await supabaseAdmin.from("photos").select("id,storage_path").in("id",photoIds).is("deleted_at",null);
        if (photoError) throw new Error(photoError.message);
        for (const row of rows) if ("photo_id" in row && row.photo_id) {
          const photo=photos?.find(p=>p.id===row.photo_id);
          if (photo) paths.set(row.id,photo.storage_path);
        }
      }
    }
    const { data: signed, error: signError } = await supabaseAdmin.storage.from("photos").createSignedUrls(rows.map(r=>paths.get(r.id) ?? r.storage_path),3600);
    if (signError) throw new Error(signError.message);
    return Object.fromEntries(rows.flatMap((r,i) => signed?.[i]?.signedUrl ? [[r.id,signed[i].signedUrl]] : [])) as Record<string,string>;
  });