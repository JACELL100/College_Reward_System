"use client";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/providers/auth-provider";
import { Button, type ButtonSize } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/env";
import { cn } from "@/lib/utils";

export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4", className)} aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.07-1.1-.16-1.6H12z" />
      <path fill="#34A853" d="M3.5 7.4l3.2 2.3C7.6 7.6 9.6 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 8.3 2.4 5.1 4.5 3.5 7.4z" opacity=".0" />
      <path fill="#4285F4" d="M21.2 12.2c0-.6-.07-1.1-.16-1.6H12v3.9h5.5c-.26 1.3-1.1 2.5-2.3 3.2l3.5 2.7c2-1.9 2.5-4.7 2.5-8.2z" />
      <path fill="#FBBC05" d="M6.4 14.3A6 6 0 0 1 6 12c0-.8.14-1.6.4-2.3L3.1 7.2A9.6 9.6 0 0 0 2.4 12c0 1.6.38 3.1 1.06 4.4l2.94-2.1z" />
      <path fill="#34A853" d="M12 21.6c2.6 0 4.8-.86 6.4-2.3l-3.5-2.7c-.9.6-2.1 1.1-3.6 1.1-2.6 0-4.8-1.7-5.6-4.1L3.4 16.4C5 19.5 8.3 21.6 12 21.6z" />
    </svg>
  );
}

export function GoogleSignInButton({
  next = "/dashboard",
  size = "lg",
  className,
  label = "Continue with Google",
}: {
  next?: string;
  size?: ButtonSize;
  className?: string;
  label?: string;
}) {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size={size}
      variant="secondary"
      loading={busy}
      disabled={!isSupabaseConfigured}
      className={cn("bg-white text-black hover:bg-white/90 border-white/20", className)}
      onClick={async () => {
        setBusy(true);
        try {
          await signIn(next);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Sign-in failed");
          setBusy(false);
        }
      }}
    >
      {!busy && <GoogleIcon />}
      {label}
    </Button>
  );
}
