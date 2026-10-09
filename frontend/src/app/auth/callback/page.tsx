"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { CoinMark } from "@/components/logo";
import { getSupabase } from "@/lib/supabase";

function Callback() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const next = params.get("next");
    const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    const oauthErr = params.get("error_description") || params.get("error");
    (async () => {
      if (oauthErr) {
        setError(oauthErr);
        return;
      }
      const sb = getSupabase();
      if (!sb) {
        setError("Supabase is not configured.");
        return;
      }
      const code = params.get("code");
      try {
        if (code) {
          const { error: exErr } = await sb.auth.exchangeCodeForSession(code);
          if (exErr) {
            // The client may already have exchanged it via detectSessionInUrl.
            const { data } = await sb.auth.getSession();
            if (!data.session) throw exErr;
          }
        } else {
          const { data } = await sb.auth.getSession();
          if (!data.session) throw new Error("No sign-in code found. Please try again.");
        }
        router.replace(dest);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sign-in failed");
      }
    })();
  }, [params, router]);

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      {error ? (
        <div className="surface-card w-full max-w-sm rounded-3xl p-8 text-center">
          <CircleAlert className="mx-auto size-8 text-red-300" />
          <h1 className="mt-4 text-lg font-semibold tracking-tight">Sign-in didn&apos;t complete</h1>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <Link
            href="/login"
            className="mt-6 inline-flex h-10 items-center rounded-xl bg-accent-gradient px-4 text-sm font-medium text-white"
          >
            Try again
          </Link>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 text-sm text-muted">
          <CoinMark size={44} className="animate-spin [animation-duration:2.4s]" />
          Signing you in…
        </div>
      )}
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Callback />
    </Suspense>
  );
}
