import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Delete, Loader2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { pinToPassword, rememberLogin, slugToEmail, useAuth, type Profile } from "@/lib/auth";
import { useServerFn } from "@tanstack/react-start";
import { listAccounts } from "@/lib/gate.functions";
import { GATE_TOKEN_KEY, getGateToken } from "@/lib/modes";
import { firstAdminSetupStatus } from "@/lib/admin-setup.functions";
import { FirstAdminSetup } from "@/components/FirstAdminSetup";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "ログイン | 三条工場 業務管理" },
      { name: "description", content: "アカウントを選んで4桁パスワードでログインします。" },
      { property: "og:title", content: "ログイン | 三条工場 業務管理" },
      { property: "og:description", content: "アカウントを選んで4桁パスワードでログインします。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const fetchAccounts = useServerFn(listAccounts);
  const fetchSetupStatus = useServerFn(firstAdminSetupStatus);
  const [initialSetup, setInitialSetup] = useState(false);
  const [accounts, setAccounts] = useState<Profile[] | null>(null);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const taps = useRef({count:0,last:0});
  const hiddenLogin = () => {
    const now=Date.now();
    taps.current={count:now-taps.current.last<1500?taps.current.count+1:1,last:now};
    if(taps.current.count>=5){taps.current.count=0;void router.navigate({to:"/admin-login"});}
  };

  const loadAccounts = async () => {
    const token = getGateToken();
    if (!token) {
      void router.navigate({ to: "/gate", replace: true });
      return;
    }
    const r = await fetchAccounts({ data: { token } });
    if (!r.ok) {
      localStorage.removeItem(GATE_TOKEN_KEY);
      void router.navigate({ to: "/gate", replace: true });
      return;
    }
    const setup = await fetchSetupStatus({ data: { token } });
    setInitialSetup(setup.available);
    setAccounts(r.accounts as Profile[]);
  };

  useEffect(() => {
    void loadAccounts().catch(() => toast.error("ログイン画面を読み込めませんでした"));
  }, []);

  const submit = async (value: string) => {
    if (!selected) return;
    setBusy(true);
    const { data: signedIn, error } = await supabase.auth.signInWithPassword({
      email: slugToEmail(selected.slug),
      password: pinToPassword(value),
    });
    if (error) {
      setBusy(false);
      setPin("");
      toast.error("パスワードが違います");
      return;
    }
    const {data:adminAccount}=await supabase.rpc("is_admin_account",{_id:signedIn.user?.id ?? ""});
    if(adminAccount){await supabase.auth.signOut();setBusy(false);setPin("");toast.error("この画面ではログインできません");return;}
    const pinRes = await supabase.rpc("set_my_pin", { _pin: value });
    if (pinRes.error) console.error("set_my_pin", pinRes.error.message);
    const { data: settings } = await supabase.from("app_settings").select("password_skip_days").eq("user_id",signedIn.user?.id ?? "").maybeSingle();
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
          <h1 className="text-2xl font-bold"><Button variant="ghost" className="h-auto cursor-default select-none p-0 text-2xl font-bold text-primary-foreground transition-none hover:bg-transparent hover:text-primary-foreground active:bg-transparent active:text-primary-foreground focus-visible:ring-0 [-webkit-tap-highlight-color:transparent]" onClick={hiddenLogin}>業務管理</Button></h1>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 pb-16 pt-6">
        {initialSetup ? <FirstAdminSetup /> : !selected ? (
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
