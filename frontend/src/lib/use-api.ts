"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errMsg } from "./api";

/** Minimal data hook: GET `path` (null = skip). */
export function useApi<T>(path: string | null, opts: { auth?: boolean } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const [tick, setTick] = useState(0);
  const auth = opts.auth;
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!path) return;
    const ctrl = new AbortController();
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await api.get<T>(path, { signal: ctrl.signal, auth });
        if (!cancelled) setData(r);
      } catch (e) {
        if (!cancelled) setError(errMsg(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [path, auth, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}
