"use client";
import { env } from "./env";
import { getAccessToken } from "./supabase";
import { sleep } from "./utils";

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
    this.name = "ApiError";
  }
  get isNetwork() {
    return this.status === 0;
  }
}

/* ---------- "Waking up server" tracker (useSyncExternalStore) ---------- */
let slowCount = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export const slowStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  get: () => slowCount > 0,
  getServer: () => false,
};

type Method = "GET" | "POST" | "PATCH" | "DELETE";
export interface ApiOptions {
  method?: Method;
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

const RETRY_STATUS = new Set([502, 503, 504]);

async function once<T>(path: string, o: ApiOptions): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (o.body !== undefined) headers["Content-Type"] = "application/json";
  if (o.auth !== false) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 30_000);
  const onAbort = () => ctrl.abort();
  o.signal?.addEventListener("abort", onAbort);
  let res: Response;
  try {
    res = await fetch(`${env.apiUrl}${path}`, {
      method: o.method ?? "GET",
      headers,
      body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch {
    if (o.signal?.aborted) throw new ApiError(-1, "Request cancelled");
    throw new ApiError(0, "Can't reach the server. It may be waking up, please retry in a moment.");
  } finally {
    clearTimeout(timer);
    o.signal?.removeEventListener("abort", onAbort);
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    let detail = res.statusText || `Request failed (${res.status})`;
    if (data && typeof data === "object" && "detail" in data) {
      const d = (data as { detail: unknown }).detail;
      if (typeof d === "string") detail = d;
      else if (Array.isArray(d) && d[0] && typeof d[0] === "object" && "msg" in d[0]) detail = String(d[0].msg);
    }
    throw new ApiError(res.status, detail);
  }
  return data as T;
}

export async function apiFetch<T>(path: string, o: ApiOptions = {}): Promise<T> {
  const retries = o.retries ?? (o.method && o.method !== "GET" ? 2 : 4);
  let slowMarked = false;
  const slowTimer = setTimeout(() => {
    slowMarked = true;
    slowCount++;
    emit();
  }, 3000);
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        return await once<T>(path, o);
      } catch (e) {
        const retryable = e instanceof ApiError && (e.status === 0 || RETRY_STATUS.has(e.status));
        if (!retryable || attempt >= retries) throw e;
        await sleep(Math.min(2000 * 2 ** attempt, 10_000));
      }
    }
  } finally {
    clearTimeout(slowTimer);
    if (slowMarked) {
      slowCount--;
      emit();
    }
  }
}

type Opts = Omit<ApiOptions, "method" | "body">;
export const api = {
  get: <T>(path: string, o: Opts = {}) => apiFetch<T>(path, o),
  post: <T>(path: string, body?: unknown, o: Opts = {}) => apiFetch<T>(path, { ...o, method: "POST", body: body ?? {} }),
  patch: <T>(path: string, body?: unknown, o: Opts = {}) => apiFetch<T>(path, { ...o, method: "PATCH", body: body ?? {} }),
  del: <T>(path: string, o: Opts = {}) => apiFetch<T>(path, { ...o, method: "DELETE" }),
};

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.detail;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}
