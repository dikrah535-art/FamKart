import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  family_id: string | null;
};

type Family = {
  id: string;
  name: string;
  invite_code: string;
  monthly_budget: number | null;
  created_by: string;
};

type AuthCtx = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  family: Family | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string) => {
    const { data: p } = await supabase
      .from("profiles")
      .select("id,full_name,avatar_url,family_id")
      .eq("id", uid)
      .maybeSingle();
    setProfile(p ?? null);
    if (p?.family_id) {
      const { data: f } = await supabase
        .from("families")
        .select("id,name,invite_code,monthly_budget,created_by")
        .eq("id", p.family_id)
        .maybeSingle();
      setFamily(f ?? null);
    } else {
      setFamily(null);
    }
  };

  const refresh = async () => {
    if (user) await loadProfile(user.id);
  };

  useEffect(() => {
    // Handle Lovable OAuth broker return (full-page redirect flow).
    // Tokens may come back in either the URL hash or query string.
    const consumeOAuthTokens = async () => {
      if (typeof window === "undefined") return false;
      const parse = (s: string) => new URLSearchParams(s.startsWith("#") || s.startsWith("?") ? s.slice(1) : s);
      const sources = [window.location.hash, window.location.search];
      for (const src of sources) {
        if (!src) continue;
        const p = parse(src);
        const access_token = p.get("access_token");
        const refresh_token = p.get("refresh_token");
        if (access_token && refresh_token) {
          try {
            await supabase.auth.setSession({ access_token, refresh_token });
          } catch (e) {
            console.error("[auth] setSession from URL failed", e);
          }
          // Clean the URL so tokens don't linger.
          const url = new URL(window.location.href);
          ["access_token", "refresh_token", "expires_in", "expires_at", "token_type", "provider_token", "provider_refresh_token", "type", "state"].forEach((k) => url.searchParams.delete(k));
          url.hash = "";
          window.history.replaceState({}, "", url.toString());
          return true;
        }
      }
      return false;
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setProfile(null);
        setFamily(null);
      }
    });
    (async () => {
      await consumeOAuthTokens();
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    })();
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider value={{ user, session, profile, family, loading, refresh, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
}