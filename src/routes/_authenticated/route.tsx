import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { loginExpired, clearLoginMemory } from "@/lib/auth";
import { MODES, getGateToken } from "@/lib/modes";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    if (!getGateToken()) throw redirect({ to: "/gate" });
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    if (loginExpired()) {
      clearLoginMemory();
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    // モード別の利用可否（管理者は全モード）
    const mode = MODES.find((m) => location.pathname === m.to || location.pathname.startsWith(m.to + "/"));
    if (mode) {
      const [{ data: roles }, { data: modes }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", data.user.id),
        supabase.from("account_modes").select("mode").eq("user_id", data.user.id),
      ]);
      const admin = !!roles?.some((r) => r.role === "admin");
      if (!admin && !modes?.some((m) => m.mode === mode.key)) throw redirect({ to: "/" });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
