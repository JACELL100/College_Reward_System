"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, signInWithGoogle } from "@/lib/supabase";
import { api, errMsg } from "@/lib/api";
import type { Profile, Role } from "@/lib/types";

interface AuthCtx {
  session: Session | null;
  ready: boolean; // session resolved
  profile: Profile | null;
  profileLoading: boolean;
  profileError: string | null;
  role: Role;
  isAdmin: boolean;
  isIssuer: boolean;
  refreshProfile: () => Promise<Profile | null>;
  setProfile: (p: Profile) => void;
  signIn: (next?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setReady(true);
      return;
    }
    let alive = true;
    sb.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setReady(true);
      if (!s) setProfile(null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const p = await api.get<Profile>("/api/me");
      setProfile(p);
      return p;
    } catch (e) {
      setProfileError(errMsg(e));
      return null;
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshProfile();
  }, [userId, refreshProfile]);

  const signOut = useCallback(async () => {
    await getSupabase()?.auth.signOut();
    setProfile(null);
    setSession(null);
  }, []);

  const value = useMemo<AuthCtx>(() => {
    const role: Role = profile?.role ?? "student";
    return {
      session,
      ready,
      profile,
      profileLoading,
      profileError,
      role,
      isAdmin: role === "admin",
      isIssuer: role === "issuer" || role === "admin",
      refreshProfile,
      setProfile,
      signIn: (next?: string) => signInWithGoogle(next),
      signOut,
    };
  }, [session, ready, profile, profileLoading, profileError, refreshProfile, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}

export function displayName(p?: { full_name?: string | null; email?: string | null } | null) {
  return p?.full_name || p?.email?.split("@")[0] || "Student";
}
