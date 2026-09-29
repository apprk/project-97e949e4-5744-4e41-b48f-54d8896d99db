import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { MODES, type ModeKey } from "@/lib/modes";

export type Profile = { id: string; name: string; slug: string; workplace?: string | null };

type AuthState = {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  /** このアカウントが利用できるモード（管理者は全モード） */
  modes: ModeKey[];
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/** 4桁PIN -> Cloud認証用パスワード（6文字以上が必須のため接頭辞を付与） */
export const pinToPassword = (pin: string) => `sanjo-${pin}`;
export const slugToEmail = (slug: string) => `${slug}@sanjo.local`;

const EXPIRY_KEY = "sanjo.pin.expiry";
const SESSION_KEY = "sanjo.pin.session";

export function rememberLogin(days: number) {
  if (days <= 0) {
    localStorage.removeItem(EXPIRY_KEY);
    sessionStorage.setItem(SESSION_KEY, "1");
    return;
  }
  localStorage.setItem(EXPIRY_KEY, String(Date.now() + days * 86400000));
}

export function loginExpired() {
  const raw = localStorage.getItem(EXPIRY_KEY);
  if (raw) return Date.now() > Number(raw);
  return sessionStorage.getItem(SESSION_KEY) !== "1";
}

export function clearLoginMemory() {
  localStorage.removeItem(EXPIRY_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [modes, setModes] = useState<ModeKey[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (uid: string | undefined) => {
    if (!uid) {
      setProfile(null);
      setIsAdmin(false);
      setModes([]);
      return;
    }
    const [{ data: p }, { data: roles }, { data: m }] = await Promise.all([
      supabase.from("profiles").select("id,name,slug,workplace").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("account_modes").select("mode").eq("user_id", uid),
    ]);
    const admin = !!roles?.some((r) => r.role === "admin");
    setProfile((p as Profile) ?? null);
    setIsAdmin(admin);
    setModes(admin ? MODES.map((x) => x.key) : ((m ?? []).map((x) => x.mode) as ModeKey[]));
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setSession(s);
      void load(s?.user.id);
    });
    void (async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      await load(data.session?.user.id);
      setLoading(false);
    })();
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    loading,
    session,
    profile,
    isAdmin,
    modes,
    refresh: async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      await load(data.session?.user.id);
    },
    signOut: async () => {
      clearLoginMemory();
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
      setIsAdmin(false);
      setModes([]);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
