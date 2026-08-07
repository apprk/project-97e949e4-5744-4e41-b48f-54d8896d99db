import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Camera, Wrench, Settings, UserRound, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "三条工場 業務管理 | ホーム" },
      {
        name: "description",
        content: "スケジュール・写真・設備管理をスマホとPCから。工場向けの業務管理アプリ。",
      },
      { property: "og:title", content: "三条工場 業務管理 | ホーム" },
      {
        property: "og:description",
        content: "スケジュール・写真・設備管理をスマホとPCから。工場向けの業務管理アプリ。",
      },
    ],
  }),
  component: Home,
});

const menu = [
  { to: "/schedule", label: "スケジュール管理", note: "申し送り・日々の予定", icon: CalendarDays },
  { to: "/photos", label: "写真管理", note: "撮影・記録・フォルダ", icon: Camera },
  { to: "/equipment", label: "設備管理", note: "周期・実施予定・履歴", icon: Wrench },
] as const;

function Home() {
  const { profile, isAdmin } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="app-header text-primary-foreground shadow-md">
        <div className="mx-auto flex max-w-5xl items-start justify-between gap-3 px-4 py-5">
          <div>
            <p className="text-xs font-medium tracking-[0.2em] opacity-80">SANJO PLANT</p>
            <h1 className="mt-1 text-2xl font-bold tracking-wide">業務管理</h1>
          </div>
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/15">
              <Link to="/settings" aria-label="設定">
                <Settings className="size-5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-5">
        <Button asChild variant="outline" size="lg" className="h-14 w-full justify-start gap-3 bg-card text-base">
          <Link to="/auth">
            <UserRound className="size-5 text-primary" />
            {profile ? (
              <span>
                {profile.name}
                {isAdmin ? "（管理者）" : ""} でログイン中 — アカウント切替
              </span>
            ) : (
              <span>アカウントを選択してログイン</span>
            )}
          </Link>
        </Button>

        <nav className="mt-5 grid gap-4 sm:grid-cols-3">
          {menu.map((m, i) => (
            <Link
              key={m.to}
              to={m.to}
              className="tile-shadow group flex min-h-40 flex-col justify-between rounded-2xl border border-border bg-card p-5 transition-transform active:scale-[0.98]"
            >
              <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <m.icon className="size-6" />
              </span>
              <span>
                <span className="block text-xs font-bold text-accent-foreground">{`0${i + 1}`}</span>
                <span className="block text-lg font-bold text-foreground">{m.label}</span>
                <span className="block text-sm text-muted-foreground">{m.note}</span>
              </span>
            </Link>
          ))}
        </nav>

        {isAdmin ? (
          <Button asChild variant="outline" size="lg" className="mt-5 h-12 w-full justify-start gap-3 bg-card">
            <Link to="/trash">
              <Trash2 className="size-5 text-primary" />
              ごみ箱（管理者）
            </Link>
          </Button>
        ) : null}
      </main>
    </div>
  );
}
