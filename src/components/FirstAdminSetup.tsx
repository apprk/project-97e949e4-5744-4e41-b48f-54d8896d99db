import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { completeFirstAdminSetup } from "@/lib/admin-setup.functions";
import { adminSetupSchema } from "@/lib/admin-setup";
import { getGateToken } from "@/lib/modes";
import { rememberLogin, useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FirstAdminSetup() {
  const [started, setStarted] = useState(false);
  const [slug, setSlug] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const save = useServerFn(completeFirstAdminSetup);
  const { refresh } = useAuth();
  const router = useRouter();
  const submit = async () => {
    if (password !== confirm) { toast.error("パスワードが一致しません"); return; }
    const input = adminSetupSchema.safeParse({ token: getGateToken(), slug, password });
    if (!input.success) { toast.error(input.error.issues[0]?.message ?? "入力を確認してください"); return; }
    setBusy(true);
    try {
      const result = await save({ data: input.data });
      const { error } = await supabase.auth.setSession(result.session);
      if (error) throw new Error("設定は完了しました。管理者ログインからログインしてください");
      rememberLogin(result.days);
      await refresh();
      setPassword(""); setConfirm("");
      toast.success("管理者の初回設定が完了しました");
      await router.navigate({ to: "/" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "設定できませんでした");
    } finally { setBusy(false); }
  };
  if (!started) return <div className="space-y-4"><h2 className="text-xl font-bold">管理者の初回設定</h2><Button className="h-12 w-full" onClick={() => setStarted(true)}>初回設定を開始</Button></div>;
  return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
    <h2 className="text-xl font-bold">管理者ID・パスワード設定</h2>
    <div className="space-y-2"><Label htmlFor="setup-id">新しいログインID</Label><Input id="setup-id" autoComplete="username" value={slug} onChange={(event) => setSlug(event.target.value)} required disabled={busy} /></div>
    <div className="space-y-2"><Label htmlFor="setup-password">新しいパスワード</Label><Input id="setup-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy} /></div>
    <div className="space-y-2"><Label htmlFor="setup-confirm">新しいパスワード（確認）</Label><Input id="setup-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required disabled={busy} /></div>
    <Button type="submit" className="h-12 w-full" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : null}設定してログイン</Button>
  </form>;
}