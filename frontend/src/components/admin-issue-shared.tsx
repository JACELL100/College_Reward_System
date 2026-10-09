"use client";
import { motion } from "motion/react";
import { CheckCircle2, ExternalLink, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/input";
import { TxLink } from "@/components/ui/misc";
import { explorerTx } from "@/lib/chain";
import type { Category, RewardSuggestion } from "@/lib/types";
import { cn, fmt } from "@/lib/utils";

export const REASON_MAX_CHARS = 90;
export const REASON_MAX_BYTES = 96;
export const BATCH_MAX = 50;

/** Imperative handle each tab exposes so the AI advisor can fill it. */
export interface ApplyHandle {
  apply: (s: RewardSuggestion) => void;
}

export function byteLen(s: string) {
  return new TextEncoder().encode(s).length;
}

export function reasonError(reason: string): string | null {
  const r = reason.trim();
  if (!r) return "A reason is required. It is stored on-chain with the reward.";
  if (r.length > REASON_MAX_CHARS) return `Keep it to ${REASON_MAX_CHARS} characters or fewer.`;
  if (byteLen(r) > REASON_MAX_BYTES) return `Too long on-chain (${byteLen(r)}/${REASON_MAX_BYTES} bytes). Remove emoji or symbols.`;
  return null;
}

export function amountError(raw: string, max: bigint | null): string | null {
  if (raw.trim() === "") return "Enter an amount";
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return "Whole number of 1 CRP or more";
  if (max !== null && BigInt(n) > max) return `Max ${fmt(max)} CRP per recipient (contract limit)`;
  return null;
}

/** Clamp a suggested reason so it always fits the on-chain limit. */
export function fitReason(s: string) {
  let r = s.trim().slice(0, REASON_MAX_CHARS);
  while (byteLen(r) > REASON_MAX_BYTES) r = r.slice(0, -1);
  return r;
}

export function CategorySelect({
  categories,
  loading,
  value,
  onChange,
  id,
}: {
  categories: Category[] | null;
  loading: boolean;
  value: number | null;
  onChange: (c: Category | null) => void;
  id?: string;
}) {
  return (
    <Select
      id={id}
      value={value ?? ""}
      disabled={loading && !categories}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v ? (categories?.find((c) => String(c.id) === v) ?? null) : null);
      }}
    >
      <option value="">{loading && !categories ? "Loading categories…" : "No category (custom)"}</option>
      {categories?.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} · {fmt(c.default_points)} CRP
        </option>
      ))}
    </Select>
  );
}

export function ReasonField({
  value,
  onChange,
  error,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  id?: string;
}) {
  const len = value.length;
  const near = len > REASON_MAX_CHARS - 12;
  return (
    <Field
      label="Reason (stored on-chain)"
      htmlFor={id}
      error={error}
      hint="Public and permanent. Visible on Etherscan."
      right={
        <span
          className={cn(
            "font-mono tabular",
            len > REASON_MAX_CHARS ? "text-red-300" : near ? "text-amber-300" : "text-subtle",
          )}
        >
          {len}/{REASON_MAX_CHARS}
        </span>
      }
    >
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, REASON_MAX_CHARS + 10))}
        placeholder="e.g. Hackathon Win: Smart India Hackathon 2026"
        className="min-h-[72px]"
        maxLength={REASON_MAX_CHARS + 10}
      />
    </Field>
  );
}

export function IssueSuccess({
  hash,
  title,
  subtitle,
  onReset,
  recorded,
}: {
  hash: string;
  title: string;
  subtitle?: React.ReactNode;
  onReset: () => void;
  recorded: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center px-6 py-10 text-center"
    >
      <div className="relative mb-5 grid size-16 place-items-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10">
        <div className="absolute inset-0 rounded-2xl bg-emerald-400/20 blur-xl" />
        <CheckCircle2 className="relative size-8 text-emerald-300" />
      </div>
      <h3 className="text-lg font-semibold tracking-tight text-fg">{title}</h3>
      {subtitle && <p className="mt-1 max-w-md text-sm text-muted">{subtitle}</p>}
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-black/30 px-3 py-2">
        <span className="text-xs text-subtle">Tx</span>
        <TxLink hash={hash} />
      </div>
      {!recorded && (
        <p className="mt-3 text-xs text-amber-300">Confirmed on-chain. The activity feed will catch up shortly.</p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button variant="secondary" onClick={onReset}>
          <RotateCcw className="size-4" /> Issue another
        </Button>
        <a
          href={explorerTx(hash)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-muted transition-colors hover:bg-white/[0.05] hover:text-fg"
        >
          View on Etherscan <ExternalLink className="size-3.5" />
        </a>
      </div>
    </motion.div>
  );
}
