"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Coins, ExternalLink, Fuel, LogOut, PlugZap, Plus, Wallet } from "lucide-react";
import { useWallet } from "@/components/providers/wallet-provider";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/misc";
import { cn, fmt, fmtEth, seedGradient, shortAddr } from "@/lib/utils";
import { explorerAddr } from "@/lib/chain";

export function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOut();
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && onOut();
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [ref, onOut, active]);
}

export function WalletButton({ compact }: { compact?: boolean }) {
  const w = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  if (!w.hydrated) return <div className="h-9 w-32 animate-pulse rounded-xl bg-white/[0.05]" />;

  if (!w.installed)
    return (
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          w.isMobile ? (window.location.href = w.deepLink) : window.open("https://metamask.io/download/", "_blank", "noopener")
        }
      >
        <Wallet className="size-4" />
        {w.isMobile ? "Open in MetaMask" : "Install MetaMask"}
      </Button>
    );

  if (!w.address)
    return (
      <Button size="sm" onClick={() => void w.connect()} loading={w.connecting}>
        {!w.connecting && <Wallet className="size-4" />}
        {compact ? "Connect" : "Connect wallet"}
      </Button>
    );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex h-9 items-center gap-2 rounded-xl border bg-elevated pl-1.5 pr-2.5 text-sm transition-colors hover:bg-hover",
          w.isCorrectChain ? "border-line" : "border-amber-500/40",
        )}
      >
        <span className="relative">
          <span className="block size-6 rounded-full" style={{ background: seedGradient(w.address) }} />
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-elevated",
              w.isCorrectChain ? "bg-emerald-400" : "bg-amber-400",
            )}
          />
        </span>
        <span className="font-mono text-xs">{shortAddr(w.address)}</span>
        {!compact && w.crpBalance !== null && (
          <span className="hidden rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-gold sm:inline">
            {fmt(w.crpBalance)} CRP
          </span>
        )}
        <ChevronDown className="size-3.5 text-muted" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="border-b border-line p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">{w.walletName ?? "Wallet"}</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 text-[11px]",
                    w.isCorrectChain ? "text-emerald-300" : "text-amber-300",
                  )}
                >
                  <span className="size-1.5 rounded-full bg-current" />
                  {w.isCorrectChain ? "Sepolia" : `Wrong network (${w.chainId ?? "?"})`}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="font-mono text-sm">{shortAddr(w.address, 6)}</span>
                <CopyButton text={w.address} label="Copy address" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-line bg-black/30 p-2.5">
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-subtle">
                    <Coins className="size-3" /> CRP
                  </div>
                  <div className="mt-1 font-mono text-sm tabular">{fmt(w.crpBalance)}</div>
                </div>
                <div className="rounded-xl border border-line bg-black/30 p-2.5">
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-subtle">
                    <Fuel className="size-3" /> ETH
                  </div>
                  <div className="mt-1 font-mono text-sm tabular">{fmtEth(w.ethBalance)}</div>
                </div>
              </div>
            </div>
            <div className="p-1.5">
              {!w.isCorrectChain && (
                <MenuItem onClick={() => void w.switchChain()} icon={<PlugZap className="size-4 text-amber-300" />}>
                  Switch to Sepolia
                </MenuItem>
              )}
              <MenuItem onClick={() => void w.watchAsset()} icon={<Plus className="size-4" />}>
                Add CRP to MetaMask
              </MenuItem>
              <MenuItem
                onClick={() => window.open(explorerAddr(w.address!), "_blank", "noopener")}
                icon={<ExternalLink className="size-4" />}
              >
                View on Etherscan
              </MenuItem>
              <MenuItem
                onClick={() => {
                  w.disconnect();
                  setOpen(false);
                }}
                icon={<LogOut className="size-4" />}
              >
                Disconnect
              </MenuItem>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MenuItem({
  children,
  icon,
  onClick,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-muted transition-colors hover:bg-white/[0.05] hover:text-fg"
    >
      {icon}
      {children}
    </button>
  );
}
