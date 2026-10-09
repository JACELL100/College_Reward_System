"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { Coins, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { CoinMark } from "@/components/logo";
import { GoogleSignInButton } from "@/components/google-button";
import { useAuth } from "@/components/providers/auth-provider";
import { isSupabaseConfigured } from "@/lib/env";

export function LoginCard() {
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const err = params.get("error");
  const { session, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && session) router.replace(next);
  }, [ready, session, next, router]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full max-w-sm"
    >
      <div className="absolute -inset-px rounded-3xl bg-gradient-to-b from-white/15 via-white/5 to-transparent" />
      <div className="relative rounded-3xl border border-line bg-surface/90 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-violet-500/40 blur-xl" />
            <CoinMark size={52} className="relative" />
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-[-0.03em]">Welcome to CampusCoin</h1>
          <p className="mt-2 text-sm text-muted">
            Sign in with your Google account to view and use your College Reward Points.
          </p>
        </div>

        {err && (
          <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs text-red-200">
            {err}
          </div>
        )}
        {!isSupabaseConfigured && (
          <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-100">
            Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
          </div>
        )}

        <GoogleSignInButton next={next} className="mt-7 w-full" />

        <ul className="mt-7 space-y-2.5 text-xs text-muted">
          <li className="flex items-center gap-2.5">
            <ShieldCheck className="size-3.5 text-emerald-300" /> Your wallet keys never leave MetaMask
          </li>
          <li className="flex items-center gap-2.5">
            <Coins className="size-3.5 text-gold" /> ERC20 balances live on Ethereum Sepolia
          </li>
          <li className="flex items-center gap-2.5">
            <Sparkles className="size-3.5 text-violet-300" /> AI assistant grounded in your activity
          </li>
        </ul>

        <div className="mt-8 flex items-center justify-between border-t border-line pt-5 text-xs text-subtle">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3" /> OAuth via Supabase
          </span>
          <Link href="/" className="hover:text-fg">
            ← Back home
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
