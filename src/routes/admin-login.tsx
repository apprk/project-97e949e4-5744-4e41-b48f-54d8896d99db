import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { administratorLogin } from "@/lib/admin-auth.functions";
import { getGateToken } from "@/lib/modes";
import { supabase } from "@/integrations/supabase/client";
import { rememberLogin, useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route=createFileRoute("/admin-login")({
  head:()=>({meta:[{title:"専用ログイン | 三条工場 業務管理"},{name:"description",content:"三条工場 業務管理の管理者認証。"},{property:"og:title",content:"専用ログイン | 三条工場 業務管理"},{property:"og:description",content:"三条工場 業務管理の管理者認証。"},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary"},{name:"robots",content:"noindex,nofollow"}]}),
  component:AdministratorLogin,
});
function AdministratorLogin(){
  const login=useServerFn(administratorLogin);const router=useRouter();const {refresh}=useAuth();
  const [slug,setSlug]=useState("");const [password,setPassword]=useState("");const [next,setNext]=useState("");const [confirm,setConfirm]=useState("");
  const [migration,setMigration]=useState(false);const [busy,setBusy]=useState(false);
  const submit=async()=>{
    if(migration && next!==confirm){toast.error("新しいパスワードが一致しません");return;}
    setBusy(true);
    try{
      const result=await login({data:{token:getGateToken(),slug,password,newPassword:migration?next:undefined}});
      if(result.migrationRequired){setMigration(true);return;}
      if(!result.session)throw new Error("認証をやり直してください");
      const {error}=await supabase.auth.setSession(result.session);if(error)throw new Error("ログインできませんでした");
      rememberLogin(result.days);await refresh();setPassword("");setNext("");setConfirm("");
      void router.navigate({to:"/"});
    }catch(e){toast.error(e instanceof Error?e.message:"ログインできませんでした");}finally{setBusy(false);}
  };
  return <div className="min-h-screen bg-background">
    <header className="app-header text-primary-foreground"><div className="mx-auto flex max-w-md items-center gap-3 px-4 py-5"><Button asChild variant="ghost" size="icon"><Link to="/auth" aria-label="戻る"><ArrowLeft/></Link></Button><h1 className="text-xl font-bold">管理者ログイン</h1></div></header>
    <main className="mx-auto max-w-md px-4 py-6"><form className="space-y-4" onSubmit={(e)=>{e.preventDefault();void submit();}}>
      <div className="space-y-2"><Label htmlFor="admin-id">ログインID</Label><Input id="admin-id" autoComplete="username" value={slug} disabled={busy || migration} onChange={(e)=>setSlug(e.target.value)} required/></div>
      <div className="space-y-2"><Label htmlFor="admin-password">{migration?"現在のパスワード":"パスワード"}</Label><Input id="admin-password" type="password" autoComplete="current-password" value={password} disabled={busy || migration} onChange={(e)=>setPassword(e.target.value)} required/></div>
      {migration?<><h2 className="font-bold">管理者パスワードの初回変更</h2><p className="text-sm text-muted-foreground">英字と数字を含む6文字以上の新しいパスワードを設定してください。</p>
        <div className="space-y-2"><Label htmlFor="admin-next">新しいパスワード</Label><Input id="admin-next" type="password" autoComplete="new-password" value={next} onChange={(e)=>setNext(e.target.value)} required disabled={busy}/></div>
        <div className="space-y-2"><Label htmlFor="admin-confirm">新しいパスワード（確認）</Label><Input id="admin-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e)=>setConfirm(e.target.value)} required disabled={busy}/></div></>:null}
      <Button type="submit" className="h-12 w-full" disabled={busy}>{busy?<Loader2 className="size-4 animate-spin"/>:null}{migration?"変更してログイン":"ログイン"}</Button>
    </form></main>
  </div>;
}