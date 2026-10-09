"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "./env";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (typeof window === "undefined") return null;
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
  }
  return client;
}

export async function getAccessToken(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function signInWithGoogle(next = "/dashboard") {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase is not configured");
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, queryParams: { prompt: "select_account" } },
  });
  if (error) throw error;
}

/** Map Supabase auth errors to friendly copy. */
export function authErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "Incorrect email or password.";
  if (m.includes("email not confirmed")) return "Please confirm your email first (check your inbox), then sign in.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a minute and try again.";
  if (m.includes("user already registered")) return "An account with this email already exists. Sign in instead.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Network error. Check your connection and try again.";
  return msg || "Something went wrong. Please try again.";
}

export async function signInWithEmail(email: string, password: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase is not configured");
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw error;
  return data.session;
}

/** Fallback sign-up through Supabase directly (sends a confirmation email). */
export async function signUpWithEmailConfirm(email: string, password: string, fullName: string, next = "/dashboard") {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase is not configured");
  const { data, error } = await sb.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: { full_name: fullName.trim() },
      emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) throw error;
  return data.session; // null => confirmation email sent
}

export async function updatePassword(password: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase is not configured");
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw error;
}

export interface AuthOptions {
  google: boolean;
  email: boolean;
  instantSignup: boolean;
}

let authOptionsPromise: Promise<AuthOptions> | null = null;

/** Which sign-in methods are actually enabled (Supabase settings + backend capability). Cached. */
export function loadAuthOptions(apiUrl: string): Promise<AuthOptions> {
  if (!authOptionsPromise) {
    const settings = fetch(`${env.supabaseUrl}/auth/v1/settings`, { headers: { apikey: env.supabaseAnonKey } })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    const backend = fetch(`${apiUrl}/api/auth/config`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    authOptionsPromise = Promise.all([settings, backend]).then(([s, b]) => ({
      google: s ? Boolean(s.external?.google) : true,
      email: s ? Boolean(s.external?.email ?? true) : true,
      instantSignup: Boolean(b?.instant_signup),
    }));
    // Allow a retry later if both lookups failed (e.g. backend cold start)
    authOptionsPromise.then((o) => {
      if (!o.instantSignup) authOptionsPromise = null;
    });
  }
  return authOptionsPromise;
}
