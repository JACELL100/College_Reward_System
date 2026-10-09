"use client";
import { useSyncExternalStore } from "react";
import { Toaster } from "sonner";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { AuthProvider } from "./auth-provider";
import { WalletProvider } from "./wallet-provider";
import { slowStore } from "@/lib/api";

function ServerWakeIndicator() {
  const slow = useSyncExternalStore(slowStore.subscribe, slowStore.get, slowStore.getServer);
  return (
    <AnimatePresence>
      {slow && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-3 z-[100] -translate-x-1/2 rounded-full border border-line bg-elevated/90 px-3.5 py-1.5 text-xs text-muted shadow-lg backdrop-blur-md"
        >
          <span className="mr-2 inline-block size-1.5 animate-pulse rounded-full bg-amber-400 align-middle" />
          Waking up server… free tier cold start can take ~50 s
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <WalletProvider>
          {children}
          <ServerWakeIndicator />
          <Toaster
            theme="dark"
            richColors
            position="bottom-right"
            closeButton
            toastOptions={{
              style: {
                background: "var(--color-elevated)",
                border: "1px solid var(--color-line)",
                color: "var(--color-fg)",
              },
            }}
          />
        </WalletProvider>
      </AuthProvider>
    </MotionConfig>
  );
}
