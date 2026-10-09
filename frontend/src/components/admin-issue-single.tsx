"use client";
import { useImperativeHandle, useState } from "react";
import { Send, X } from "lucide-react";
import { useWallet } from "@/components/providers/wallet-provider";
import { UserPicker, type PickedRecipient } from "@/components/user-picker";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { AddressChip, Avatar } from "@/components/ui/misc";
import type { Category } from "@/lib/types";
import { fmt } from "@/lib/utils";
import {
  type ApplyHandle,
  CategorySelect,
  IssueSuccess,
  ReasonField,
  amountError,
  fitReason,
  reasonError,
} from "@/components/admin-issue-shared";

export function AdminIssueSingle({
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
  const { sendContractTx, address } = useWallet();
  const [recipient, setRecipient] = useState<PickedRecipient | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<{ hash: string; amount: number; name: string; recorded: boolean } | null>(
    null,
  );

  useImperativeHandle(
    ref,
    () => ({
      apply: (s) => {
        setSuccess(null);
        const cat = s.category_id != null ? categories?.find((c) => c.id === s.category_id) : undefined;
        setCategoryId(cat ? cat.id : null);
        setAmount(String(s.points));
        setReason(fitReason(s.reason));
      },
    }),
    [categories],
  );

  const pickCategory = (c: Category | null) => {
    const prev = categories?.find((x) => x.id === categoryId);
    setCategoryId(c?.id ?? null);
    if (c) {
      setAmount(String(c.default_points));
      if (!reason.trim() || (prev && reason.trim() === prev.name)) setReason(fitReason(c.name));
    }
  };

  const aErr = amountError(amount, maxIssue);
  const rErr = reasonError(reason);
  const recErr = !recipient ? "Choose a recipient" : address && recipient.address === address ? "You can't reward your own wallet here" : null;
  const valid = !aErr && !rErr && !recErr;

  const submit = async () => {
    setSubmitted(true);
    if (!valid || !recipient) return;
    setBusy(true);
    const n = Number(amount);
    const r = await sendContractTx({
      method: "issueReward",
      args: [recipient.address, BigInt(n), reason.trim()],
      label: `Issue ${fmt(n)} CRP`,
      categoryId,
      note: note.trim() || null,
    });
    setBusy(false);
    if (r) {
      setSuccess({
        hash: r.hash,
        amount: n,
        name: recipient.name ?? `${recipient.address.slice(0, 6)}…${recipient.address.slice(-4)}`,
        recorded: r.record?.status === "confirmed",
      });
    }
  };

  const reset = () => {
    setSuccess(null);
    setRecipient(null);
    setCategoryId(null);
    setAmount("");
    setReason("");
    setNote("");
    setSubmitted(false);
  };

  if (success) {
    return (
      <IssueSuccess
        hash={success.hash}
        title={`${fmt(success.amount)} CRP issued`}
        subtitle={
          <>
            Minted to <span className="text-fg">{success.name}</span> for &ldquo;{reason.trim()}&rdquo;
          </>
        }
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
      <Field label="Recipient" error={submitted ? recErr : null}>
        {recipient ? (
          <div className="flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/[0.07] p-3">
            <Avatar src={recipient.avatar_url} name={recipient.name} seed={recipient.address} size={38} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{recipient.name ?? "External address"}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <AddressChip address={recipient.address} />
                {recipient.department && <span className="text-xs text-muted">{recipient.department}</span>}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setRecipient(null)} aria-label="Change recipient">
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <UserPicker value={recipient} onChange={setRecipient} exclude={address} />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="single-category">
          <CategorySelect
            id="single-category"
            categories={categories}
            loading={categoriesLoading}
            value={categoryId}
            onChange={pickCategory}
          />
        </Field>
        <Field
          label="Amount (CRP)"
          htmlFor="single-amount"
          error={submitted || amount ? aErr : null}
          right={maxIssue !== null ? `max ${fmt(maxIssue)}` : undefined}
        >
          <Input
            id="single-amount"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            max={maxIssue !== null ? Number(maxIssue) : undefined}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100"
            className="font-mono"
          />
        </Field>
      </div>

      <ReasonField id="single-reason" value={reason} onChange={setReason} error={submitted ? rErr : null} />

      <Field label="Private note (optional)" htmlFor="single-note" hint="Stored off-chain for admins only.">
        <Input
          id="single-note"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 300))}
          placeholder="e.g. Certificate #A-1042, verified by Prof. Rao"
        />
      </Field>

      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-subtle">
          {recipient && !aErr ? (
            <>
              Mints <span className="font-mono text-fg">{fmt(Number(amount))} CRP</span> to{" "}
              <span className="text-fg">{recipient.name ?? "this address"}</span>. Requires Sepolia ETH for gas.
            </>
          ) : (
            "You'll confirm the transaction in MetaMask."
          )}
        </p>
        <Button type="submit" size="lg" loading={busy} disabled={blocked}>
          {!busy && <Send className="size-4" />} Issue reward
        </Button>
      </div>
    </form>
  );
}
