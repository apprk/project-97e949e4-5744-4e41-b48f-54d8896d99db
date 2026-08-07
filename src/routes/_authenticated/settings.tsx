import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Loader2, Save, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pinToPassword, rememberLogin, slugToEmail, useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "設定 | 三条工場 業務管理" },
      { name: "description", content: "パスワード変更、パスワード省略期間、アカウント管理。" },
      { property: "og:title", content: "設定 | 三条工場 業務管理" },
      { property: "og:description", content: "パスワード変更、パスワード省略期間、アカウント管理。" },
    ],
  }),
  component: SettingsPage,
});

const SKIP_OPTIONS = [
  { value: "0", label: "常に入力" },
  { value: "1", label: "1日" },
  { value: "7", label: "7日" },
  { value: "30", label: "30日" },
];

function SettingsPage() {
  const { profile, isAdmin, session } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [skip, setSkip] = useState("0");
  const [retention, setRetention] = useState("30");
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newPin, setNewPin] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("password_skip_days,trash_retention_days")
        .maybeSingle();
      if (data) {
        setSkip(String(data.password_skip_days));
        setRetention(String(data.trash_retention_days));
      }
      setLoaded(true);
    })();
  }, []);

  const changePin = async () => {
    if (!profile) return;
    if (!/^\d{4}$/.test(next)) {
      toast.error("新しいパスワードは4桁の数字で入力してください");
      return;
    }
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: slugToEmail(profile.slug),
      password: pinToPassword(current),
    });
    if (signInError) {
      setBusy(false);
      toast.error("現在のパスワードが違います");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: pinToPassword(next) });
    setBusy(false);
    if (error) {
      toast.error("変更に失敗しました");
      return;
    }
    setCurrent("");
    setNext("");
    toast.success("パスワードを変更しました");
  };

  const saveSettings = async () => {
    if (!session) return;
    const days = Number(skip);
    const { error } = await supabase.from("app_settings").upsert({
      user_id: session.user.id,
      password_skip_days: days,
      trash_retention_days: Number(retention),
      updated_at: new Date().toISOString(),
    });
    if (error) {
      toast.error("保存に失敗しました");
      return;
    }
    rememberLogin(days);
    toast.success("設定を保存しました");
  };

  const addAccount = async () => {
    if (!newName.trim() || !/^[a-z0-9_-]{2,20}$/.test(newSlug) || !/^\d{4}$/.test(newPin)) {
      toast.error("名前、ID（英小文字・数字）、4桁パスワードを入力してください");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: slugToEmail(newSlug),
      password: pinToPassword(newPin),
      options: { emailRedirectTo: window.location.origin, data: { name: newName.trim(), slug: newSlug } },
    });
    setBusy(false);
    if (error || !data.user) {
      toast.error("追加に失敗しました（IDが重複している可能性があります）");
      return;
    }
    toast.success(`${newName} を追加しました。次回ログイン時に選択できます。`);
    setNewName("");
    setNewSlug("");
    setNewPin("");
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="設定" />
      <main className="mx-auto max-w-md space-y-6 px-4 pb-24 pt-5">
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <KeyRound className="size-5 text-primary" /> パスワード変更
          </h2>
          <div className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cur">現在のパスワード</Label>
              <Input
                id="cur"
                inputMode="numeric"
                maxLength={4}
                className="h-12"
                value={current}
                onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new">新しいパスワード（4桁）</Label>
              <Input
                id="new"
                inputMode="numeric"
                maxLength={4}
                className="h-12"
                value={next}
                onChange={(e) => setNext(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <Button className="h-12 w-full" disabled={busy} onClick={changePin}>
              変更する
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-base font-bold">パスワード省略設定</h2>
          <p className="mt-1 text-xs text-muted-foreground">同じ端末でパスワード入力を省略する期間です。</p>
          {loaded ? (
            <div className="mt-3 space-y-3">
              <Select value={skip} onValueChange={setSkip}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SKIP_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="space-y-1.5">
                <Label htmlFor="ret">ごみ箱の保管日数</Label>
                <Input
                  id="ret"
                  type="number"
                  min={1}
                  className="h-12"
                  value={retention}
                  onChange={(e) => setRetention(e.target.value)}
                />
              </div>
              <Button className="h-12 w-full" onClick={saveSettings}>
                <Save className="size-5" /> 保存
              </Button>
            </div>
          ) : (
            <div className="flex justify-center py-6">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          )}
        </section>

        {isAdmin ? (
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 text-base font-bold">
              <UserPlus className="size-5 text-primary" /> アカウント管理（管理者）
            </h2>
            <div className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="an">アカウント名</Label>
                <Input id="an" className="h-12" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="as">ログインID（英小文字・数字）</Label>
                <Input
                  id="as"
                  className="h-12"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap">初期パスワード（4桁）</Label>
                <Input
                  id="ap"
                  inputMode="numeric"
                  maxLength={4}
                  className="h-12"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <Button className="h-12 w-full" disabled={busy} onClick={addAccount}>
                アカウントを追加
              </Button>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
