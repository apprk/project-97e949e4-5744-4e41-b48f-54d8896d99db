import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Delete, Loader2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { pinToPassword, rememberLogin, slugToEmail, useAuth, type Profile } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "ログイン | 三条工場 業務管理" },
      { name: "description", content: "アカウントを選んで4桁パスワードでログインします。" },
      { property: "og:title", content: "ログイン | 三条工場 業務管理" },
      { property: "og:description", content: "アカウントを選んで4桁パスワードでログインします。" },
    ],
  }),
  component: AuthPage,
});

async function bootstrapAdmin() {
  const email = slugToEmail("admin");
  const { error } = await supabase.auth.signUp({
    email,
    password: pinToPassword("0000"),
    options: { emailRedirectTo: window.location.origin, data: { name: "管理者", slug: "admin" } },
  });
  if (error) return;
  // プロフィールと管理者権限はデータベーストリガーが自動作成する
  await supabase.auth.signOut();
}

function AuthPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [accounts, setAccounts] = useState<Profile[] | null>(null);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const loadAccounts = async () => {
    const { data } = await supabase.from("profiles").select("id,name,slug").order("created_at");
    if (!data || data.length === 0) {
      await bootstrapAdmin();
      const { data: retry } = await supabase.from("profiles").select("id,name,slug").order("created_at");
      setAccounts((retry as Profile[]) ?? []);
      return;
    }
    setAccounts(data as Profile[]);
  };

  useEffect(() => {
    void loadAccounts();
  }, []);

  const submit = async (value: string) => {
    if (!selected) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: slugToEmail(selected.slug),
      password: pinToPassword(value),
    });
    if (error) {
      setBusy(false);
      setPin("");
      toast.error("パスワードが違います");
      return;
    }
    const { data: settings } = await supabase.from("app_settings").select("password_skip_days").maybeSingle();
    rememberLogin(settings?.password_skip_days ?? 0);
    await refresh();
    setBusy(false);
    toast.success(`${selected.name} でログインしました`);
    void router.navigate({ to: "/" });
  };

  const press = (d: string) => {
    if (busy) return;
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) void submit(next);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="app-header text-primary-foreground shadow-md">
        <div className="mx-auto max-w-md px-4 py-5">
          <h1 className="text-2xl font-bold tracking-wide">業務管理</h1>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 pb-16 pt-6">
        {!selected ? (
          <>
            <h2 className="mb-3 text-sm font-bold text-muted-foreground">アカウントを選択</h2>
            {accounts === null ? (
              <div className="flex justify-center py-10">
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            ) : (
              <ul className="space-y-3">
                {accounts.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(a);
                        setPin("");
                      }}
                      className="tile-shadow flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-5 text-left text-lg font-bold transition-transform active:scale-[0.99]"
                    >
                      <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                        <UserRound className="size-5" />
                      </span>
                      {a.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <p className="text-center text-sm text-muted-foreground">{selected.name}</p>
            <h2 className="mb-6 mt-1 text-center text-xl font-bold">4桁パスワードを入力</h2>
            <div className="mb-8 flex justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`size-5 rounded-full border-2 border-primary ${pin.length > i ? "bg-primary" : ""}`}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <Button key={d} variant="outline" className="h-16 bg-card text-2xl font-bold" onClick={() => press(d)}>
                  {d}
                </Button>
              ))}
              <Button
                variant="ghost"
                className="h-16 text-sm"
                onClick={() => {
                  setSelected(null);
                  setPin("");
                }}
              >
                戻る
              </Button>
              <Button variant="outline" className="h-16 bg-card text-2xl font-bold" onClick={() => press("0")}>
                0
              </Button>
              <Button variant="ghost" className="h-16" aria-label="1文字削除" onClick={() => setPin(pin.slice(0, -1))}>
                <Delete className="size-6" />
              </Button>
            </div>
            {busy ? (
              <div className="mt-6 flex justify-center">
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
