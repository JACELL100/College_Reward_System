import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortAddr(addr?: string | null, chars = 4) {
  if (!addr) return "";
  return `${addr.slice(0, 2 + chars)}…${addr.slice(-chars)}`;
}

export function shortHash(hash?: string | null) {
  if (!hash) return "";
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

const nf = new Intl.NumberFormat("en-IN");
export function fmt(n: number | bigint | null | undefined) {
  if (n === null || n === undefined) return "—";
  return nf.format(typeof n === "bigint" ? Number(n) : n);
}

export function fmtEth(wei: bigint | null | undefined, digits = 4) {
  if (wei === null || wei === undefined) return "—";
  const eth = Number(wei) / 1e18;
  return eth.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: eth === 0 ? 0 : 2 });
}

export function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/** Deterministic gradient (blockie-like) from a seed string (address / id). */
export function seedGradient(seed?: string | null) {
  const s = (seed || "campuscoin").toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 40 + ((h >> 8) % 80)) % 360;
  const c = (b + 30 + ((h >> 16) % 60)) % 360;
  return `conic-gradient(from ${(h >> 4) % 360}deg, hsl(${a} 80% 60%), hsl(${b} 75% 55%), hsl(${c} 85% 62%), hsl(${a} 80% 60%))`;
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
