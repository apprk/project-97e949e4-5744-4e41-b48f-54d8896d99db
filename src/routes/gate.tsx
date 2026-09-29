import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { unlockGate } from "@/lib/gate.functions";
import { GATE_TOKEN_KEY } from "@/lib/modes";

export const Route = createFileRoute("/gate")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "初期認証 | 三条工場 業務管理" },
      { name: "description", content: "この端末で業務管理アプリを使うための初期認証です。" },
      { property: "og:title", content: "初期認証 | 三条工場 業務管理" },
      { property: "og:description", content: "この端末で業務管理アプリを使うための初期認証です。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GatePage,
});

function GatePage() {
  const router = useRouter();
  const unlock = useServerFn(unlockGate);
  const [id, setId] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await unlock({ data: { id: id.trim(), pass } });
      if (!r.ok || !r.token) {
        toast.error("IDまたはPASSが違います");
        return;
      }
      localStorage.setItem(GATE_TOKEN_KEY, r.token);
      void router.navigate({ to: "/auth", replace: true });
    } catch {
      toast.error("認証できませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="app-header text-primary-foreground shadow-md">
        <div className="mx-auto max-w-md px-4 py-5">
          <h1 className="text-2xl font-bold tracking-wide">業務管理</h1>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 pb-16 pt-8">
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <ShieldCheck className="size-5 text-primary" /> 初期認証
          </h2>
          <div className="space-y-1.5">
            <Label htmlFor="gid">ID</Label>
            <Input id="gid" className="h-12" autoComplete="username" value={id} onChange={(e) => setId(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gpass">PASS</Label>
            <Input
              id="gpass"
              type="password"
              className="h-12"
              autoComplete="current-password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
          </div>
          <Button type="submit" className="h-12 w-full" disabled={busy || !id || !pass}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : null} 認証する
          </Button>
        </form>
      </main>
    </div>
  );
}
