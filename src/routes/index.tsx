import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, loginExpired, clearLoginMemory } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { MODES, getGateToken } from "@/lib/modes";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    if (!getGateToken()) throw redirect({ to: "/gate" });
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    if (loginExpired()) {
      clearLoginMemory();
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
  },
  head: () => ({
    meta: [
      { title: "三条工場 業務管理 | ホーム" },
      {
        name: "description",
        content: "スケジュール・写真・物品購入・設備保全をスマホとPCから。工場向けの業務管理アプリ。",
      },
      { property: "og:title", content: "三条工場 業務管理 | ホーム" },
      {
        property: "og:description",
        content: "スケジュール・写真・物品購入・設備保全をスマホとPCから。工場向けの業務管理アプリ。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

function Home() {
  const { profile, modes, can } = useAuth();
  const showSettings=["settings","trash","accounts.manage","accounts.list","gate"].some(can);
  const menu = MODES.filter((m) => modes.includes(m.key));

  return (
    <div className="min-h-screen bg-background">
      <header className="app-header text-primary-foreground shadow-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-5">
          <h1 className="text-2xl font-bold tracking-wide">業務管理</h1>
          <div className="flex items-center gap-2">
            {profile ? (
              <Link to="/auth" className="text-[11px] opacity-90 underline-offset-2 hover:underline">
                {profile.name} - ログイン中
              </Link>
            ) : null}
            {showSettings ? <Button asChild variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/15">
              <Link to="/settings" aria-label="設定">
                <Settings className="size-5" />
              </Link>
            </Button> : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
        <nav className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {menu.map((m) => (
            <Link
              key={m.to}
              to={m.to}
              className="tile-shadow flex min-h-36 flex-col items-start justify-between rounded-2xl border border-border bg-card p-5 transition-transform active:scale-[0.98]"
            >
              <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <m.icon className="size-6" />
              </span>
              <span className="text-lg font-bold text-foreground">{m.label}</span>
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
