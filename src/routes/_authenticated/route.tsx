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
    const {data:adminAccount}=await supabase.rpc("is_admin_account",{_id:data.user.id});
    if(adminAccount){const {data:allowed}=await supabase.rpc("is_admin");if(!allowed || loginExpired()){clearLoginMemory();await supabase.auth.signOut();throw redirect({to:"/admin-login"});}}
    if (loginExpired()) {
      clearLoginMemory();
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
    const mode = MODES.find((m) => location.pathname === m.to || location.pathname.startsWith(m.to + "/"));
    const [{ data: allowedAdmin }, { data: modes }] = await Promise.all([
      supabase.rpc("is_admin"),
      supabase.from("account_modes").select("mode").eq("user_id", data.user.id),
    ]);
    const admin=allowedAdmin===true;
    const perms=(modes ?? []).map((r)=>r.mode);
    if(perms.some((p)=>["settings.writers","settings.suppliers","settings.analytics"].includes(p)))perms.push("purchases.settings");
    if(!admin){
      if(mode && !perms.includes(mode.key))throw redirect({to:"/"});
      if(location.pathname==="/settings" && !["settings","trash","accounts.manage","accounts.list","gate"].some((p)=>perms.includes(p)))throw redirect({to:"/"});
      if(location.pathname==="/trash" && !perms.includes("trash"))throw redirect({to:"/"});
      if(location.pathname==="/purchase-analytics" && (!perms.includes("purchases") || !perms.includes("purchases.settings")))throw redirect({to:"/"});
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
