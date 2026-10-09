"use client";
import { useCallback, useEffect, useState } from "react";
import { readContractState, readIsIssuer, type ContractState } from "@/lib/chain";
import { isContractConfigured } from "@/lib/env";
import { errMsg } from "@/lib/api";

/** Live contract state via the read-only Sepolia provider. */
export function useContractState() {
  const [state, setState] = useState<ContractState | null>(null);
  const [loading, setLoading] = useState<boolean>(isContractConfigured);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!isContractConfigured) return;
    let cancelled = false;
    readContractState()
      .then((s) => {
        if (cancelled) return;
        setState(s);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(errMsg(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);
  const reload = useCallback(() => {
    setLoading(true);
    setTick((t) => t + 1);
  }, []);
  return { state, loading, error, reload };
}

/** On-chain isIssuer(address). `null` = unknown / not checked. */
export function useIsIssuerOnchain(address: string | null | undefined) {
  const [result, setResult] = useState<{ addr: string; value: boolean | null } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!address || !isContractConfigured) return;
    let cancelled = false;
    readIsIssuer(address)
      .then((v) => {
        if (!cancelled) setResult({ addr: address, value: v });
      })
      .catch(() => {
        if (!cancelled) setResult({ addr: address, value: null });
      });
    return () => {
      cancelled = true;
    };
  }, [address, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const current = result && result.addr === address ? result.value : null;
  const loading = !!address && isContractConfigured && (!result || result.addr !== address);
  return { isIssuer: current, loading, reload };
}
