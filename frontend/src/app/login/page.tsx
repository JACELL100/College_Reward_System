import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginCard } from "./login-card";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/20 blur-[120px]" />
      <div className="pointer-events-none absolute left-[60%] top-[55%] size-[360px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[100px]" />
      <Suspense fallback={<div className="h-[420px] w-full max-w-sm animate-pulse rounded-3xl bg-white/[0.03]" />}>
        <LoginCard />
      </Suspense>
    </div>
  );
}
