"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { readCrpBalance, readProvider } from "@/lib/chain";

/** On-chain balance of the connected wallet, falling back to the linked wallet. */
export function useMyBalance() {
  const w = useWallet();
  const { profile } = useAuth();
  const linked = profile?.wallet_address?.toLowerCase() ?? null;
  const address = w.address ?? linked;
  const useConnected = !!w.address;
  const [fallback, setFallback] = useState<{ addr: string; crp: bigint | null; eth: bigint | null } | null>(null);

  const load = useCallback(async () => {
    if (useConnected || !linked) return;
    try {
      const [crp, eth] = await Promise.all([readCrpBalance(linked), readProvider().getBalance(linked)]);
      setFallback({ addr: linked, crp, eth });
    } catch {
      /* ignore */
    }
  }, [useConnected, linked]);

  useEffect(() => {
    if (useConnected || !linked) return;
    const t = setTimeout(() => void load(), 0);
    const id = setInterval(() => void load(), 15_000);
    return () => {
      clearTimeout(t);
      clearInterval(id);
    };
  }, [useConnected, linked, load]);

  const fb = fallback && fallback.addr === linked ? fallback : null;
  const crp = useConnected ? w.crpBalance : (fb?.crp ?? null);
  const eth = useConnected ? w.ethBalance : (fb?.eth ?? null);
  const refresh = useCallback(async () => {
    if (useConnected) await w.refreshBalances();
    else await load();
  }, [useConnected, w, load]);
  return { address, crp, eth, loading: !!address && crp === null, refresh, source: useConnected ? "wallet" : "linked" };
}
