"use client";
import { useEffect, useImperativeHandle, useMemo, useState } from "react";
import { Check, Layers, Minus, Search, Send, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useWallet } from "@/components/providers/wallet-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { Avatar, EmptyState, ErrorState, ListSkeleton } from "@/components/ui/misc";
import { useApi } from "@/lib/use-api";
import type { AdminUser, Category } from "@/lib/types";
import { cn, fmt, shortAddr } from "@/lib/utils";
import {
  type ApplyHandle,
  BATCH_MAX,
  CategorySelect,
  IssueSuccess,
  ReasonField,
  amountError,
  fitReason,
  reasonError,
} from "@/components/admin-issue-shared";

interface Picked {
  user: AdminUser;
  amount: string | null; // null = use shared amount
}

export function AdminIssueBatch({
  ref,
  categories,
  categoriesLoading,
  maxIssue,
  blocked,
}: {
  ref?: React.Ref<ApplyHandle>;
  categories: Category[] | null;
  categoriesLoading: boolean;
  maxIssue: bigint | null;
  blocked: boolean;
}) {
  const { sendContractTx } = useWallet();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data: users, loading, error, reload } = useApi<AdminUser[]>(
    `/api/admin/users?role=student${debounced ? `&q=${encodeURIComponent(debounced)}` : ""}`,
  );

  const [picked, setPicked] = useState<Record<string, Picked>>({});
  const [shared, setShared] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<{ hash: string; count: number; total: number; recorded: boolean } | null>(
    null,
  );

  useImperativeHandle(
    ref,
    () => ({
      apply: (s) => {
        setSuccess(null);
        const cat = s.category_id != null ? categories?.find((c) => c.id === s.category_id) : undefined;
        setCategoryId(cat ? cat.id : null);
        setShared(String(s.points));
        setReason(fitReason(s.reason));
      },
    }),
    [categories],
  );

  const list = users ?? [];
  const eligible = list.filter((u) => !!u.wallet_address);
  const pickedList = Object.values(picked);
  const count = pickedList.length;
  const full = count >= BATCH_MAX;

  const effAmount = (p: Picked) => (p.amount === null ? shared : p.amount);
  const rowErrors = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const [addr, p] of Object.entries(picked)) out[addr] = amountError(p.amount === null ? shared : p.amount, maxIssue);
    return out;
  }, [picked, shared, maxIssue]);
  const badRows = Object.values(rowErrors).filter(Boolean).length;
  const total = pickedList.reduce((s, p) => {
    const n = Number(effAmount(p));
    return s + (Number.isInteger(n) && n > 0 ? n : 0);
  }, 0);

  const toggle = (u: AdminUser) => {
    const addr = u.wallet_address?.toLowerCase();
    if (!addr) return;
    setPicked((prev) => {
      if (prev[addr]) {
        const next = { ...prev };
        delete next[addr];
        return next;
      }
      if (Object.keys(prev).length >= BATCH_MAX) {
        toast.error(`A batch can include at most ${BATCH_MAX} recipients`);
        return prev;
      }
      return { ...prev, [addr]: { user: u, amount: null } };
    });
  };

  const visibleSelected = eligible.filter((u) => picked[u.wallet_address!.toLowerCase()]).length;
  const allVisible = eligible.length > 0 && visibleSelected === eligible.length;

  const toggleAllVisible = () => {
    setPicked((prev) => {
      const next = { ...prev };
      if (allVisible) {
        for (const u of eligible) delete next[u.wallet_address!.toLowerCase()];
        return next;
      }
      let skipped = 0;
      for (const u of eligible) {
        const a = u.wallet_address!.toLowerCase();
        if (next[a]) continue;
        if (Object.keys(next).length >= BATCH_MAX) {
          skipped++;
          continue;
        }
        next[a] = { user: u, amount: null };
      }
      if (skipped) toast.warning(`Batch capped at ${BATCH_MAX}; ${skipped} student${skipped === 1 ? "" : "s"} not added`);
      return next;
    });
  };

  const setRowAmount = (addr: string, v: string) =>
    setPicked((prev) => (prev[addr] ? { ...prev, [addr]: { ...prev[addr], amount: v === "" ? null : v } } : prev));

  const pickCategory = (c: Category | null) => {
    const prev = categories?.find((x) => x.id === categoryId);
    setCategoryId(c?.id ?? null);
    if (c) {
      setShared(String(c.default_points));
      if (!reason.trim() || (prev && reason.trim() === prev.name)) setReason(fitReason(c.name));
    }
  };

  const sharedErr = amountError(shared, maxIssue);
  const rErr = reasonError(reason);
  const selErr = count === 0 ? "Select at least one student" : null;

  const submit = async () => {
    setSubmitted(true);
    if (selErr || rErr || badRows) {
      if (badRows) toast.error(`${badRows} recipient amount${badRows === 1 ? " is" : "s are"} invalid`);
      return;
    }
    const recipients = Object.keys(picked);
    const amounts = recipients.map((a) => BigInt(Number(effAmount(picked[a]))));
    setBusy(true);
    const r = await sendContractTx({
      method: "batchIssueReward",
      args: [recipients, amounts, reason.trim()],
      label: `Batch issue ${fmt(total)} CRP to ${recipients.length}`,
      categoryId,
      note: note.trim() || null,
    });
    setBusy(false);
    if (r) setSuccess({ hash: r.hash, count: recipients.length, total, recorded: r.record?.status === "confirmed" });
  };

  const reset = () => {
    setSuccess(null);
    setPicked({});
    setSubmitted(false);
    setNote("");
  };

  if (success) {
    return (
      <IssueSuccess
        hash={success.hash}
        title={`${fmt(success.total)} CRP issued to ${success.count} student${success.count === 1 ? "" : "s"}`}
        subtitle={<>One transaction, {success.count} mints, for &ldquo;{reason.trim()}&rdquo;</>}
        recorded={success.recorded}
        onReset={reset}
      />
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Category" htmlFor="batch-category" className="sm:col-span-2">
          <CategorySelect
            id="batch-category"
            categories={categories}
            loading={categoriesLoading}
            value={categoryId}
            onChange={pickCategory}
          />
        </Field>
        <Field
          label="Default amount"
          htmlFor="batch-amount"
          error={submitted || shared ? sharedErr : null}
          right={maxIssue !== null ? `max ${fmt(maxIssue)}` : undefined}
        >
          <Input
            id="batch-amount"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={shared}
            onChange={(e) => setShared(e.target.value)}
            placeholder="50"
            className="font-mono"
          />
        </Field>
      </div>

      <ReasonField id="batch-reason" value={reason} onChange={setReason} error={submitted ? rErr : null} />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted">Recipients</span>
            <Badge tone={full ? "warning" : count ? "accent" : "neutral"}>
              {count}/{BATCH_MAX} selected
            </Badge>
          </div>
          {count > 0 && (
            <button type="button" onClick={() => setPicked({})} className="text-xs text-muted hover:text-fg">
              Clear selection
            </button>
          )}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search students by name, email, roll no…"
            className="pl-9"
            aria-label="Search students"
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-line bg-black/20">
          <div className="flex items-center gap-3 border-b border-line bg-white/[0.02] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.1em] text-subtle">
            <button
              type="button"
              onClick={toggleAllVisible}
              disabled={eligible.length === 0}
              aria-label={allVisible ? "Deselect all visible" : "Select all visible"}
              className={cn(
                "grid size-[18px] shrink-0 place-items-center rounded-md border transition-colors disabled:opacity-40",
                allVisible
                  ? "border-accent bg-accent text-white"
                  : visibleSelected
                    ? "border-accent/60 bg-accent/30 text-white"
                    : "border-line-strong bg-black/30",
              )}
            >
              {allVisible ? <Check className="size-3" /> : visibleSelected ? <Minus className="size-3" /> : null}
            </button>
            <span className="flex-1">Student</span>
            <span className="hidden w-20 text-right sm:block">Balance</span>
            <span className="w-24 text-right">Amount</span>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {loading && !users ? (
              <div className="p-4">
                <ListSkeleton rows={6} />
              </div>
            ) : error && !users ? (
              <div className="p-4">
                <ErrorState message={error} onRetry={reload} />
              </div>
            ) : list.length === 0 ? (
              <EmptyState
                icon={Users}
                title={debounced ? "No students match" : "No students yet"}
                description={debounced ? "Try a different search." : "Students appear here after they sign in."}
                className="py-10"
              />
            ) : (
              <ul className="divide-y divide-line/60">
                {list.map((u) => {
                  const addr = u.wallet_address?.toLowerCase() ?? null;
                  const p = addr ? picked[addr] : undefined;
                  const sel = !!p;
                  const disabled = !addr || (!sel && full);
                  const err = addr && sel ? rowErrors[addr] : null;
                  return (
                    <li
                      key={u.id}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 transition-colors",
                        sel ? "bg-accent/[0.07]" : !addr ? "opacity-55" : "hover:bg-white/[0.02]",
                      )}
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={sel}
                        aria-label={`Select ${u.full_name ?? u.email}`}
                        disabled={disabled}
                        onClick={() => toggle(u)}
                        className={cn(
                          "grid size-[18px] shrink-0 place-items-center rounded-md border transition-colors disabled:cursor-not-allowed",
                          sel ? "border-accent bg-accent text-white" : "border-line-strong bg-black/30 hover:border-accent/60",
                        )}
                      >
                        {sel && <Check className="size-3" />}
                      </button>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => toggle(u)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
                      >
                        <Avatar src={u.avatar_url} name={u.full_name ?? u.email} seed={addr ?? u.id} size={32} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{u.full_name ?? u.email}</div>
                          <div className="truncate text-xs text-muted">
                            {addr ? (
                              <>
                                <span className="font-mono">{shortAddr(addr)}</span>
                                {u.department && <> · {u.department}</>}
                                {u.roll_no && <> · {u.roll_no}</>}
                              </>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-300/80">
                                <Wallet className="size-3" /> No wallet linked
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                      <span className="hidden w-20 text-right font-mono text-xs tabular text-muted sm:block">
                        {fmt(u.balance ?? 0)}
                      </span>
                      <div className="w-24">
                        {sel && addr ? (
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            value={p.amount ?? ""}
                            placeholder={shared || "—"}
                            onChange={(e) => setRowAmount(addr, e.target.value)}
                            aria-label={`Amount for ${u.full_name ?? u.email}`}
                            aria-invalid={!!err}
                            title={err ?? undefined}
                            className={cn(
                              "h-8 px-2 text-right font-mono text-xs",
                              err && (submitted || p.amount !== null || shared) && "border-red-500/60",
                            )}
                          />
                        ) : (
                          <span className="block text-right text-xs text-subtle">—</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        {submitted && selErr && <p className="text-xs text-red-300">{selErr}</p>}
        {list.length > 0 && eligible.length < list.length && (
          <p className="text-xs text-subtle">
            {list.length - eligible.length} student{list.length - eligible.length === 1 ? "" : "s"} without a linked wallet
            can&apos;t receive CRP yet.
          </p>
        )}
      </div>

      <Field label="Private note (optional)" htmlFor="batch-note" hint="Stored off-chain for admins only.">
        <Input
          id="batch-note"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 300))}
          placeholder="e.g. Tech fest 2026 volunteer roster"
        />
      </Field>

      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl border border-line bg-elevated">
            <Layers className="size-4 text-muted" />
          </div>
          <div>
            <div className="font-mono text-lg font-semibold tabular text-fg">
              {fmt(total)} <span className="text-xs text-subtle">CRP</span>
            </div>
            <div className="text-xs text-subtle">
              {count} recipient{count === 1 ? "" : "s"} · one transaction
              {badRows > 0 && <span className="text-red-300"> · {badRows} invalid</span>}
            </div>
          </div>
        </div>
        <Button type="submit" size="lg" loading={busy} disabled={blocked}>
          {!busy && <Send className="size-4" />} Issue to {count || "…"}
        </Button>
      </div>
    </form>
  );
}
