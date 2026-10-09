"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { getAddress, isAddress } from "ethers";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  Fuel,
  Link2,
  Loader2,
  Network,
  PauseCircle,
  RotateCcw,
  Send,
  ShieldAlert,
  Wallet,
  X,
} from "lucide-react";
import { useAuth, displayName } from "@/components/providers/auth-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { useLinkWallet } from "@/components/providers/use-link-wallet";
import { useContractState } from "@/components/onchain-hooks";
import { UserPicker, type PickedRecipient } from "@/components/user-picker";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/input";
import { AddressChip, Avatar, CopyButton, PageHeader, Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { FAUCETS, explorerTx, readContract, readProvider } from "@/lib/chain";
import { isContractConfigured } from "@/lib/env";
import type { DirectoryEntry } from "@/lib/types";
import { cn, fmt, fmtEth, shortAddr } from "@/lib/utils";

const NOTE_MAX = 140;
const QUICK = [10, 25, 50, 100];
const ease = [0.16, 1, 0.3, 1] as const;

type Step = "form" | "review" | "success";

interface SentResult {
  hash: string;
  amount: number;
  to: PickedRecipient;
  note: string;
}

function checksum(addr: string) {
  try {
    return getAddress(addr);
  } catch {
    return addr;
  }
}

/* ------------------------------ Gas estimate ------------------------------ */
function useGasEstimate(enabled: boolean, from: string | null, to: string | null, amount: number) {
  const [state, setState] = useState<{ key: string; wei: bigint | null; units: bigint | null } | null>(null);
  const key = `${from}|${to}|${amount}`;
  useEffect(() => {
    if (!enabled || !from || !to || amount <= 0) return;
    const c = readContract();
    if (!c) return;
    let cancelled = false;
    (async () => {
      try {
        const [units, fee] = await Promise.all([
          c.getFunction("transfer").estimateGas(to, BigInt(amount), { from }),
          readProvider().getFeeData(),
        ]);
        const price = fee.maxFeePerGas ?? fee.gasPrice ?? null;
        if (!cancelled) setState({ key, units, wei: price ? units * price : null });
      } catch {
        if (!cancelled) setState({ key, units: null, wei: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, from, to, amount, key]);
  const current = state?.key === key ? state : null;
  return { gas: current, loading: enabled && !current };
}

/* ------------------------------ Status gate ------------------------------ */
function Gate({
  icon: Icon,
  tone = "accent",
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: "accent" | "warning" | "danger";
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
}) {
  const ring =
    tone === "warning"
      ? "border-amber-500/20 bg-amber-500/[0.06] text-amber-300"
      : tone === "danger"
        ? "border-red-500/20 bg-red-500/[0.06] text-red-300"
        : "border-violet-500/20 bg-violet-500/[0.08] text-violet-300";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-4 rounded-2xl border border-line bg-black/20 p-4 sm:flex-row sm:items-center"
    >
      <div className={cn("grid size-10 shrink-0 place-items-center rounded-xl border", ring)}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">{title}</p>
        <div className="mt-0.5 text-xs leading-relaxed text-muted">{description}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </motion.div>
  );
}

/* ------------------------------ Recipient card ------------------------------ */
function RecipientCard({ r, onClear }: { r: PickedRecipient; onClear?: () => void }) {
  const cs = checksum(r.address);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/[0.06] p-3">
      <Avatar src={r.avatar_url} name={r.name} seed={r.address} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-fg">{r.name ?? "External address"}</span>
          {!r.name && <Badge tone="neutral">Not in directory</Badge>}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1">
          <span className="truncate font-mono text-[11px] text-muted" title={cs}>
            {cs}
          </span>
          <CopyButton text={cs} label="Copy checksum address" className="shrink-0" />
        </div>
        {r.department && <div className="truncate text-[11px] text-subtle">{r.department}</div>}
      </div>
      {onClear && (
        <Button variant="ghost" size="icon" onClick={onClear} aria-label="Change recipient">
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}

/* ------------------------------ Main ------------------------------ */
function SendInner() {
  const params = useSearchParams();
  const { profile } = useAuth();
  const w = useWallet();
  const { link, linking, linked, mismatch } = useLinkWallet();
  const { state: contract } = useContractState();

  const prefill = params.get("to")?.trim() ?? "";
  const [recipient, setRecipient] = useState<PickedRecipient | null>(() =>
    isAddress(prefill) ? { address: prefill.toLowerCase(), name: null } : null,
  );
  const [amountStr, setAmountStr] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<SentResult | null>(null);

  // Resolve a prefilled / pasted address against the directory for a friendly name.
  const resolveAddr = recipient && !recipient.name ? recipient.address : null;
  useEffect(() => {
    if (!resolveAddr) return;
    const ctrl = new AbortController();
    api
      .get<DirectoryEntry[]>(`/api/directory?q=${encodeURIComponent(resolveAddr)}`, { signal: ctrl.signal, retries: 1 })
      .then((list) => {
        const hit = list?.find((d) => d.wallet_address?.toLowerCase() === resolveAddr);
        if (hit)
          setRecipient((cur) =>
            cur && cur.address === resolveAddr
              ? {
                  address: resolveAddr,
                  name: hit.full_name,
                  avatar_url: hit.avatar_url,
                  id: hit.id,
                  department: hit.department,
                }
              : cur,
          );
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [resolveAddr]);

  const me = w.address;
  const balance = w.crpBalance;
  const balanceNum = balance !== null ? Number(balance) : null;
  const amount = /^\d+$/.test(amountStr) ? parseInt(amountStr, 10) : 0;
  const isSelf = !!recipient && (recipient.address === me || recipient.address === linked);
  const insufficient = balanceNum !== null && amount > balanceNum;
  const noGas = w.ethBalance !== null && w.ethBalance === 0n;
  const paused = contract?.paused === true;

  const gate = useMemo(() => {
    if (!isContractConfigured) return "contract";
    if (!w.hydrated) return "hydrating";
    if (!w.installed) return "install";
    if (!me) return "connect";
    if (!w.isCorrectChain) return "chain";
    if (!profile?.wallet_address) return "link";
    return null;
  }, [w.hydrated, w.installed, me, w.isCorrectChain, profile?.wallet_address]);

  const amountError = !amountStr
    ? null
    : amount <= 0
      ? "Enter a whole number of points greater than zero."
      : insufficient
        ? `You only have ${fmt(balanceNum)} CRP.`
        : null;

  const canReview =
    !gate && !!recipient && !isSelf && amount > 0 && !insufficient && balanceNum !== null && !paused && !noGas;

  const { gas, loading: gasLoading } = useGasEstimate(step === "review", me, recipient?.address ?? null, amount);

  const confirm = async () => {
    if (!recipient || !canReview) return;
    setSending(true);
    try {
      const res = await w.sendContractTx({
        method: "transfer",
        args: [checksum(recipient.address), BigInt(amount)],
        label: `Send ${fmt(amount)} CRP`,
        note: note.trim() || null,
      });
      if (res) {
        setSent({ hash: res.hash, amount, to: recipient, note: note.trim() });
        setStep("success");
      }
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setRecipient(null);
    setAmountStr("");
    setNote("");
    setSent(null);
    setStep("form");
  };

  /* --------------------------- gate rendering --------------------------- */
  let gateEl: React.ReactNode = null;
  if (gate === "contract")
    gateEl = (
      <Gate
        icon={ShieldAlert}
        tone="danger"
        title="Contract not configured"
        description="NEXT_PUBLIC_CONTRACT_ADDRESS is missing, so transfers are disabled."
      />
    );
  else if (gate === "hydrating") gateEl = <Skeleton className="h-[74px] w-full rounded-2xl" />;
  else if (gate === "install")
    gateEl = (
      <Gate
        icon={Wallet}
        title="MetaMask required"
        description={
          w.isMobile
            ? "Open CampusCoin inside the MetaMask app browser to send CRP."
            : "Install the MetaMask extension to sign transfers from your wallet."
        }
        action={
          <ButtonLink href={w.isMobile ? w.deepLink : "https://metamask.io/download/"} external size="sm">
            {w.isMobile ? "Open in MetaMask" : "Get MetaMask"} <ExternalLink className="size-3.5" />
          </ButtonLink>
        }
      />
    );
  else if (gate === "connect")
    gateEl = (
      <Gate
        icon={Wallet}
        title="Connect your wallet"
        description="Transfers are signed by you in MetaMask. CampusCoin never holds your keys."
        action={
          <Button size="sm" onClick={() => void w.connect()} loading={w.connecting}>
            Connect wallet
          </Button>
        }
      />
    );
  else if (gate === "chain")
    gateEl = (
      <Gate
        icon={Network}
        tone="warning"
        title="Wrong network"
        description="CRP lives on the Sepolia testnet. Switch networks to continue."
        action={
          <Button size="sm" variant="secondary" onClick={() => void w.switchChain()}>
            Switch to Sepolia
          </Button>
        }
      />
    );
  else if (gate === "link")
    gateEl = (
      <Gate
        icon={Link2}
        title="Link your wallet first"
        description="Sign a free message so classmates see your name on transfers. No gas required."
        action={
          <Button size="sm" onClick={() => void link()} loading={linking}>
            Link wallet
          </Button>
        }
      />
    );

  const warnings: React.ReactNode[] = [];
  if (!gate && paused)
    warnings.push(
      <Gate
        key="paused"
        icon={PauseCircle}
        tone="warning"
        title="Transfers are paused"
        description="The admin has paused the contract. Try again once it's resumed."
      />,
    );
  if (!gate && noGas)
    warnings.push(
      <Gate
        key="gas"
        icon={Fuel}
        tone="warning"
        title="No Sepolia ETH for gas"
        description={
          <>
            Every transfer costs a tiny amount of test ETH. Claim the free gas drip on your{" "}
            <Link href="/dashboard" className="text-accent-2 hover:underline">
              dashboard
            </Link>{" "}
            or use a faucet:{" "}
            {FAUCETS.map((f, i) => (
              <span key={f.url}>
                {i > 0 && " · "}
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-accent-2 hover:underline">
                  {f.name}
                </a>
              </span>
            ))}
          </>
        }
      />,
    );
  if (!gate && mismatch)
    warnings.push(
      <Gate
        key="mismatch"
        icon={AlertTriangle}
        tone="warning"
        title="Different wallet connected"
        description={
          <>
            MetaMask is on {shortAddr(me)}, but your account is linked to {shortAddr(linked)}. Points will be sent from
            the connected wallet.
          </>
        }
      />,
    );

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="Transfer"
        title="Send CRP"
        description="Move reward points to a classmate. Transfers settle on Sepolia in about 12 seconds."
      />

      <AnimatePresence mode="wait">
        {step === "success" && sent ? (
          <SuccessView key="success" sent={sent} balance={balanceNum} onAgain={reset} />
        ) : step === "review" && recipient ? (
          <motion.div
            key="review"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.3, ease }}
          >
            <Card>
              <CardHeader
                title="Review transfer"
                description="Double-check before signing. On-chain transfers can't be reversed."
                icon={<Send className="size-4" />}
              />
              <CardBody className="space-y-4">
                <div className="rounded-2xl border border-line bg-black/20 p-5 text-center">
                  <div className="text-xs text-muted">You&apos;re sending</div>
                  <div className="mt-1 font-mono text-4xl font-semibold tracking-tight text-fg tabular">
                    {fmt(amount)} <span className="text-lg text-subtle">CRP</span>
                  </div>
                  {balanceNum !== null && (
                    <div className="mt-1 text-xs text-subtle">
                      Balance after: <span className="font-mono text-muted">{fmt(balanceNum - amount)} CRP</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">From</div>
                  <div className="flex items-center gap-3 rounded-xl border border-line bg-black/20 p-3">
                    <Avatar src={profile?.avatar_url} name={displayName(profile)} seed={me} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{displayName(profile)} (you)</div>
                      <div className="truncate font-mono text-[11px] text-muted">{me ? checksum(me) : ""}</div>
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <div className="grid size-8 place-items-center rounded-full border border-line bg-elevated text-muted">
                      <ArrowDown className="size-4" />
                    </div>
                  </div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">To</div>
                  <RecipientCard r={recipient} />
                </div>

                <dl className="divide-y divide-line/60 rounded-xl border border-line bg-black/20 text-sm">
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <dt className="text-muted">Network</dt>
                    <dd className="flex items-center gap-1.5 text-fg">
                      <span className="size-1.5 rounded-full bg-emerald-400" /> Sepolia
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <dt className="text-muted">Est. network fee</dt>
                    <dd className="text-right font-mono text-xs text-fg">
                      {gasLoading ? (
                        <Skeleton className="h-4 w-24" />
                      ) : gas?.wei ? (
                        <>~{fmtEth(gas.wei, 6)} SepoliaETH</>
                      ) : (
                        <span className="text-muted">~50k gas · paid in test ETH</span>
                      )}
                    </dd>
                  </div>
                  {note.trim() && (
                    <div className="flex items-start justify-between gap-4 px-4 py-3">
                      <dt className="shrink-0 text-muted">Note</dt>
                      <dd className="min-w-0 break-words text-right text-fg">{note.trim()}</dd>
                    </div>
                  )}
                </dl>
                <p className="text-[11px] leading-relaxed text-subtle">
                  The fee is paid in free Sepolia test ETH, not CRP. Notes are stored off-chain with the transaction
                  record and are visible to the recipient.
                </p>

                <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-between">
                  <Button variant="ghost" onClick={() => setStep("form")} disabled={sending}>
                    <ArrowLeft className="size-4" /> Back
                  </Button>
                  <Button size="lg" onClick={confirm} loading={sending} disabled={!canReview}>
                    {sending ? "Confirm in MetaMask…" : <>Confirm &amp; send</>}
                  </Button>
                </div>
              </CardBody>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.3, ease }}
            className="space-y-4"
          >
            {gateEl}
            {warnings}

            <Card>
              <CardBody className="space-y-6">
                {/* Balance */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-black/20 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-xs text-muted">Available balance</div>
                    <div className="mt-0.5 font-mono text-xl font-semibold tracking-tight tabular">
                      {me && balance === null ? (
                        <Skeleton className="h-6 w-20" />
                      ) : balanceNum !== null ? (
                        <>
                          {fmt(balanceNum)} <span className="text-xs text-subtle">CRP</span>
                        </>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </div>
                  </div>
                  {me && <AddressChip address={me} />}
                </div>

                {/* Recipient */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted">Recipient</div>
                  {recipient ? (
                    <>
                      <RecipientCard r={recipient} onClear={() => setRecipient(null)} />
                      {isSelf && (
                        <p className="flex items-center gap-1.5 text-xs text-red-300">
                          <AlertTriangle className="size-3.5" /> You can&apos;t send CRP to your own wallet.
                        </p>
                      )}
                    </>
                  ) : (
                    <UserPicker value={recipient} onChange={setRecipient} exclude={me ?? linked} />
                  )}
                </div>

                {/* Amount */}
                <Field
                  label="Amount"
                  htmlFor="send-amount"
                  error={amountError}
                  hint="CRP has no decimals, whole points only."
                  right={
                    balanceNum !== null ? (
                      <span>
                        Balance <span className="font-mono text-muted">{fmt(balanceNum)}</span>
                      </span>
                    ) : null
                  }
                >
                  <div className="relative">
                    <Input
                      id="send-amount"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="0"
                      value={amountStr}
                      onChange={(e) => setAmountStr(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 12))}
                      className={cn(
                        "h-14 pr-32 font-mono text-2xl tabular",
                        amountError && "border-red-500/40 focus:border-red-500/60 focus:ring-red-500/15",
                      )}
                    />
                    <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-2">
                      <span className="text-sm text-subtle">CRP</span>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!balanceNum}
                        onClick={() => balanceNum && setAmountStr(String(balanceNum))}
                      >
                        Max
                      </Button>
                    </div>
                  </div>
                </Field>
                <div className="-mt-3 flex flex-wrap gap-2">
                  {QUICK.map((q) => (
                    <button
                      key={q}
                      type="button"
                      disabled={balanceNum !== null && q > balanceNum}
                      onClick={() => setAmountStr(String(q))}
                      className={cn(
                        "rounded-lg border px-2.5 py-1 font-mono text-xs transition-colors disabled:opacity-40",
                        amount === q
                          ? "border-accent/50 bg-accent/10 text-fg"
                          : "border-line bg-black/20 text-muted hover:border-line-strong hover:text-fg",
                      )}
                    >
                      {q}
                    </button>
                  ))}
                </div>

                {/* Note */}
                <Field
                  label="Note (optional)"
                  htmlFor="send-note"
                  right={
                    <span className={cn("font-mono", note.length > NOTE_MAX - 15 && "text-amber-300")}>
                      {note.length}/{NOTE_MAX}
                    </span>
                  }
                >
                  <Textarea
                    id="send-note"
                    value={note}
                    maxLength={NOTE_MAX}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Thanks for the lab notes!"
                    className="min-h-[72px]"
                  />
                </Field>

                <Button size="lg" className="w-full" disabled={!canReview} onClick={() => setStep("review")}>
                  Review transfer <ArrowRight className="size-4" />
                </Button>
              </CardBody>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------ Success ------------------------------ */
function SuccessView({ sent, balance, onAgain }: { sent: SentResult; balance: number | null; onAgain: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease }}
    >
      <Card className="overflow-hidden">
        <div className="relative px-6 pb-6 pt-10 text-center">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-accent-gradient opacity-[0.08] blur-3xl" />
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 320, damping: 18, delay: 0.05 }}
            className="relative mx-auto grid size-16 place-items-center rounded-full border border-emerald-500/30 bg-emerald-500/10"
          >
            <Check className="size-7 text-emerald-300" strokeWidth={2.5} />
          </motion.div>
          <h2 className="relative mt-5 text-xl font-semibold tracking-tight">Transfer confirmed</h2>
          <p className="relative mt-1 text-sm text-muted">
            <span className="font-mono text-fg">{fmt(sent.amount)} CRP</span> sent to{" "}
            <span className="text-fg">{sent.to.name ?? shortAddr(sent.to.address)}</span>
          </p>
        </div>
        <CardBody className="space-y-4 border-t border-line pt-5">
          <dl className="divide-y divide-line/60 rounded-xl border border-line bg-black/20 text-sm">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-muted">Your new balance</dt>
              <dd className="font-mono text-fg">
                {balance !== null ? (
                  <>
                    {fmt(balance)} <span className="text-xs text-subtle">CRP</span>
                  </>
                ) : (
                  <Loader2 className="size-4 animate-spin text-subtle" />
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-muted">Recipient</dt>
              <dd>
                <AddressChip address={sent.to.address} />
              </dd>
            </div>
            {sent.note && (
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <dt className="shrink-0 text-muted">Note</dt>
                <dd className="min-w-0 break-words text-right text-fg">{sent.note}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <dt className="text-muted">Transaction</dt>
              <dd className="min-w-0 truncate font-mono text-xs text-muted">{shortAddr(sent.hash, 8)}</dd>
            </div>
          </dl>
          <div className="grid gap-2 sm:grid-cols-3">
            <ButtonLink href={explorerTx(sent.hash)} external variant="secondary">
              Etherscan <ExternalLink className="size-3.5" />
            </ButtonLink>
            <ButtonLink href="/activity" variant="secondary">
              View activity
            </ButtonLink>
            <Button onClick={onAgain}>
              <RotateCcw className="size-4" /> Send another
            </Button>
          </div>
        </CardBody>
      </Card>
    </motion.div>
  );
}

export default function SendPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl space-y-4">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-[480px] w-full rounded-2xl" />
        </div>
      }
    >
      <SendInner />
    </Suspense>
  );
}
