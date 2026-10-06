import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export function AppHeader({ title, back = "/" }: { title: string; back?: string }) {
  const { profile, signOut, can } = useAuth();
  const showSettings = ["settings", "trash", "accounts.manage", "accounts.list", "gate"].some(can);
  const router = useRouter();

  return (
    <header className="app-header sticky top-0 z-20 text-primary-foreground shadow-md">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-3">
        {back ? (
          <Button asChild variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/15">
            <Link to={back} aria-label="戻る">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
        ) : null}
        <h1 className="flex-1 truncate text-lg font-bold tracking-wide">{title}</h1>
        {profile ? (
          <span className="hidden text-[11px] opacity-90 sm:inline">{profile.name} - ログイン中</span>
        ) : null}
        {showSettings ? <Button asChild variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/15">
          <Link to="/settings" aria-label="設定">
            <Settings className="size-5" />
          </Link>
        </Button> : null}
        {profile ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="ログアウト"
            className="text-primary-foreground hover:bg-white/15"
            onClick={async () => {
              await signOut();
              void router.navigate({ to: "/auth", replace: true });
            }}
          >
            <LogOut className="size-5" />
          </Button>
        ) : null}
      </div>
    </header>
  );
}
