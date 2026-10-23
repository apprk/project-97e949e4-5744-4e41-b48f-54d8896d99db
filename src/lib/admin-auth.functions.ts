import { assertNormalMode } from "@/lib/equipment-view";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validAdminPassword, retentionExpiry } from "@/lib/admin-password";

export const administratorLogin = createServerFn({method:"POST"})
  .inputValidator((d)=>z.object({token:z.string().nullable(),slug:z.string().min(1).max(100),password:z.string().max(1000),newPassword:z.string().max(1000).optional()}).parse(d))
  .handler(async({data})=>{
    const {verifyDeviceToken,passwordClient,sessionId}=await import("@/lib/admin-auth.server");
    verifyDeviceToken(data.token);
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const {data:profile}=await supabaseAdmin.from("profiles").select("id,slug").eq("slug",data.slug).is("disabled_at",null).maybeSingle();
    if(!profile)throw new Error("IDまたはパスワードが違います");
    const {data:role}=await supabaseAdmin.from("user_roles").select("id").eq("user_id",profile.id).eq("role","admin").maybeSingle();
    if(!role)throw new Error("IDまたはパスワードが違います");
    const {data:state}=await supabaseAdmin.from("admin_auth_state").select("user_id").eq("user_id",profile.id).maybeSingle();
    const legacy=!state && /^\d{4}$/.test(data.password);
    if(!legacy && !validAdminPassword(data.password))throw new Error("英字と数字を含む6文字以上のパスワードを入力してください");
    const client=passwordClient();
    let result=await client.auth.signInWithPassword({email:`${profile.slug}@sanjo.local`,password:legacy?`sanjo-${data.password}`:data.password});
    if(result.error || !result.data.session)throw new Error("IDまたはパスワードが違います");
    if(legacy && !data.newPassword){await client.auth.signOut({scope:"local"});return {migrationRequired:true as const,session:null,days:0};}
    if(legacy){
      if(!data.newPassword || !validAdminPassword(data.newPassword))throw new Error("新しいパスワードは英字と数字を含む6文字以上で入力してください");
      const {error}=await supabaseAdmin.auth.admin.updateUserById(profile.id,{password:data.newPassword});
      if(error)throw new Error("パスワードを変更できませんでした");
      result=await client.auth.signInWithPassword({email:`${profile.slug}@sanjo.local`,password:data.newPassword});
      if(result.error || !result.data.session)throw new Error("新しいパスワードでログインしてください");
    }
    const session=result.data.session;
    if(!session)throw new Error("認証をやり直してください");
    const {data:settings}=await supabaseAdmin.from("app_settings").select("password_skip_days").eq("user_id",profile.id).maybeSingle();
    const days=settings?.password_skip_days ?? 0;
    const {error:sessionError}=await supabaseAdmin.from("admin_login_sessions").upsert({session_id:sessionId(session.access_token),user_id:profile.id,expires_at:new Date(retentionExpiry(days,Date.now())).toISOString()});
    if(sessionError)throw new Error("認証を保存できませんでした");
    const {error:stateError}=await supabaseAdmin.from("admin_auth_state").upsert({user_id:profile.id});
    if(stateError)throw new Error("認証を保存できませんでした");
    await supabaseAdmin.from("account_pins").delete().eq("user_id",profile.id);
    return {migrationRequired:false as const,session:{access_token:session.access_token,refresh_token:session.refresh_token},days};
  });

export const changeAdministratorPassword=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
  .inputValidator((d)=>z.object({current:z.string().max(1000),next:z.string().max(1000)}).parse(d))
  .handler(async({data,context})=>{
    await assertNormalMode(context.supabase);
    const {data:admin}=await context.supabase.rpc("is_admin");
    if(!admin)throw new Error("Forbidden");
    if(!validAdminPassword(data.next))throw new Error("英字と数字を含む6文字以上で入力してください");
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const {data:state}=await supabaseAdmin.from("admin_auth_state").select("user_id").eq("user_id",context.userId).maybeSingle();
    const {data:user}=await supabaseAdmin.auth.admin.getUserById(context.userId);
    if(!user.user?.email)throw new Error("認証をやり直してください");
    const {passwordClient}=await import("@/lib/admin-auth.server");
    const client=passwordClient();
    const {error}=await client.auth.signInWithPassword({email:user.user.email,password:!state && /^\d{4}$/.test(data.current)?`sanjo-${data.current}`:data.current});
    if(error)throw new Error("現在のパスワードが違います");
    const {error:updateError}=await supabaseAdmin.auth.admin.updateUserById(context.userId,{password:data.next});
    await client.auth.signOut({scope:"local"});
    if(updateError)throw new Error("変更に失敗しました");
    return {ok:true};
  });

export const retainAdministratorSession=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
  .inputValidator((d)=>z.object({days:z.union([z.literal(0),z.literal(1),z.literal(7),z.literal(30)])}).parse(d))
  .handler(async({data,context})=>{
    await assertNormalMode(context.supabase);
    const {data:admin}=await context.supabase.rpc("is_admin");if(!admin)throw new Error("Forbidden");
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const id=context.claims.session_id;
    if(typeof id!=="string")throw new Error("認証をやり直してください");
    const {error}=await supabaseAdmin.from("admin_login_sessions").upsert({session_id:id,user_id:context.userId,expires_at:new Date(retentionExpiry(data.days,Date.now())).toISOString()});
    if(error)throw new Error("保存に失敗しました");return {ok:true};
  });