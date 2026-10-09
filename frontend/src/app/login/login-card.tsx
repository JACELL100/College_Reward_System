"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ArrowRight, Check, Coins, Eye, EyeOff, Lock, Mail, MailCheck, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { CoinMark } from "@/components/logo";
import { GoogleSignInButton } from "@/components/google-button";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { api, ApiError, errMsg } from "@/lib/api";
import { env, isSupabaseConfigured } from "@/lib/env";
import {
  type AuthOptions,
  authErrorMessage,
  loadAuthOptions,
  signInWithEmail,
  signUpWithEmailConfirm,
} from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function passwordChecks(pw: string) {
  return [
    { ok: pw.length >= 8, label: "8+ characters" },
    { ok: /[A-Za-z]/.test(pw) && /\d/.test(pw), label: "Letters & numbers" },
    { ok: /[^A-Za-z0-9]/.test(pw) || pw.length >= 12, label: "Symbol or 12+ chars" },
  ];
}

function PasswordInput({
  id, value, onChange, autoComplete, placeholder,
}: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="pl-9 pr-10"
        maxLength={72}
        required
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-subtle transition-colors hover:bg-white/[0.06] hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function LoginCard() {
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const err = params.get("error");
  const { session, ready } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>(params.get("mode") === "signup" ? "signup" : "signin");
  const [opts, setOpts] = useState<AuthOptions | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    if (ready && session) router.replace(next);
  }, [ready, session, next, router]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    loadAuthOptions(env.apiUrl).then((o) => alive && setOpts(o));
    return () => {
      alive = false;
    };
  }, []);

  const switchMode = (m: Mode) => {
    setMode(m);
    setFormError(null);
    setTouched(false);
  };

  const checks = useMemo(() => passwordChecks(password), [password]);
  const strength = checks.filter((c) => c.ok).length;

  const errors = {
    name: mode === "signup" && name.trim().length < 2 ? "Enter your full name" : null,
    email: !EMAIL_RE.test(email.trim()) ? "Enter a valid email address" : null,
    password:
      mode === "signup"
        ? !checks[0].ok || !checks[1].ok
          ? "Use 8+ characters with letters and numbers"
          : null
        : !password
          ? "Enter your password"
          : null,
    confirm: mode === "signup" && confirm !== password ? "Passwords don't match" : null,
  };
  const invalid = Object.values(errors).some(Boolean);
  const show = (k: keyof typeof errors) => (touched ? errors[k] : null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setFormError(null);
    if (invalid || !isSupabaseConfigured) return;
    setBusy(true);
    try {
      if (mode === "signin") {
        await signInWithEmail(email, password);
        toast.success("Welcome back");
        router.replace(next);
        return;
      }
      // Sign up: prefer instant server-side creation (no confirmation email needed)
      const o = opts ?? (await loadAuthOptions(env.apiUrl));
      let instant = o.instantSignup;
      if (instant) {
        try {
          await api.post("/api/auth/signup", { email: email.trim(), password, full_name: name.trim() }, { auth: false, timeoutMs: 60_000 });
        } catch (x) {
          if (x instanceof ApiError && x.status === 503) instant = false;
          else throw x;
        }
      }
      if (instant) {
        await signInWithEmail(email, password);
        toast.success("Account created", { description: "Next: connect MetaMask and link your wallet." });
        router.replace(next);
        return;
      }
      const s = await signUpWithEmailConfirm(email, password, name, next);
      if (s) {
        toast.success("Account created");
        router.replace(next);
      } else {
        setSentTo(email.trim().toLowerCase());
      }
    } catch (x) {
      setFormError(x instanceof ApiError ? errMsg(x) : authErrorMessage(x));
    } finally {
      setBusy(false);
    }
  };

  const googleOn = opts?.google ?? false;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full max-w-[400px]"
    >
      <div className="absolute -inset-px rounded-3xl bg-gradient-to-b from-white/15 via-white/5 to-transparent" />
      <div className="relative rounded-3xl border border-line bg-surface/90 p-7 shadow-2xl backdrop-blur-xl sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-violet-500/40 blur-xl" />
            <CoinMark size={48} className="relative" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">
            {sentTo ? "Check your inbox" : mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {sentTo
              ? "One more step to activate your account."
              : mode === "signin"
                ? "Sign in to view and use your College Reward Points."
                : "Join CampusCoin and start earning reward points."}
          </p>
        </div>

        {err && !sentTo && (
          <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs text-red-200">{err}</div>
        )}
        {!isSupabaseConfigured && (
          <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-100">
            Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
          </div>
        )}

        {sentTo ? (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-7 space-y-5 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10">
              <MailCheck className="size-6 text-emerald-300" />
            </div>
            <p className="text-sm leading-relaxed text-muted">
              We sent a confirmation link to <span className="font-medium text-fg">{sentTo}</span>. Open it to activate your account, then sign in.
            </p>
            <Button variant="secondary" className="w-full" onClick={() => { setSentTo(null); switchMode("signin"); }}>
              Back to sign in
            </Button>
          </motion.div>
        ) : (
          <>
            <Tabs<Mode>
              className="mt-7 w-full [&>*]:flex-1"
              value={mode}
              onChange={switchMode}
              items={[
                { value: "signin", label: "Sign in" },
                { value: "signup", label: "Create account" },
              ]}
            />

            <form onSubmit={submit} noValidate className="mt-5 space-y-4">
              <AnimatePresence initial={false}>
                {mode === "signup" && (
                  <motion.div
                    key="name"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <Field label="Full name" htmlFor="name" error={show("name")}>
                      <div className="relative">
                        <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
                        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your full name" className="pl-9" maxLength={80} />
                      </div>
                    </Field>
                  </motion.div>
                )}
              </AnimatePresence>

              <Field label="Email" htmlFor="email" error={show("email")}>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
                  <Input id="email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@college.edu" className="pl-9" maxLength={254} required />
                </div>
              </Field>

              <Field label="Password" htmlFor="password" error={show("password")}>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={setPassword}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  placeholder={mode === "signin" ? "Your password" : "Create a password"}
                />
              </Field>

              {mode === "signup" && (
                <>
                  <div className="-mt-1 space-y-2" aria-live="polite">
                    <div className="flex gap-1.5">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className={cn(
                            "h-1 flex-1 rounded-full transition-colors duration-300",
                            i < strength ? (strength === 3 ? "bg-emerald-400" : strength === 2 ? "bg-amber-400" : "bg-red-400") : "bg-white/[0.08]",
                          )}
                        />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {checks.map((c) => (
                        <span key={c.label} className={cn("inline-flex items-center gap-1 text-[11px] transition-colors", c.ok ? "text-emerald-300" : "text-subtle")}>
                          <Check className="size-3" aria-hidden /> {c.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Field label="Confirm password" htmlFor="confirm" error={show("confirm")}>
                    <PasswordInput id="confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" placeholder="Repeat password" />
                  </Field>
                </>
              )}

              {formError && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  role="alert"
                  className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-xs text-red-200"
                >
                  {formError}
                </motion.div>
              )}

              <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!isSupabaseConfigured}>
                {mode === "signin" ? "Sign in" : "Create account"}
                {!busy && <ArrowRight className="size-4" aria-hidden />}
              </Button>
            </form>

            {googleOn && (
              <>
                <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-subtle">
                  <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
                </div>
                <GoogleSignInButton next={next} className="w-full" />
              </>
            )}

            <p className="mt-5 text-center text-xs text-muted">
              {mode === "signin" ? "New to CampusCoin? " : "Already have an account? "}
              <button
                type="button"
                onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
                className="font-medium text-fg underline-offset-2 hover:underline"
              >
                {mode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </>
        )}

        <ul className="mt-6 space-y-2 border-t border-line pt-5 text-xs text-muted">
          <li className="flex items-center gap-2.5"><ShieldCheck className="size-3.5 text-emerald-300" /> Your wallet keys never leave MetaMask</li>
          <li className="flex items-center gap-2.5"><Coins className="size-3.5 text-gold" /> ERC20 balances live on Ethereum Sepolia</li>
          <li className="flex items-center gap-2.5"><Sparkles className="size-3.5 text-violet-300" /> AI assistant grounded in your activity</li>
        </ul>

        <div className="mt-5 flex items-center justify-between text-xs text-subtle">
          <span className="inline-flex items-center gap-1.5"><Lock className="size-3" /> Secured by Supabase Auth</span>
          <Link href="/" className="hover:text-fg">← Back home</Link>
        </div>
      </div>
    </motion.div>
  );
}
