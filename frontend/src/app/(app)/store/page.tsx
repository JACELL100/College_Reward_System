"use client";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Coins,
  Flame,
  Gift,
  Infinity as InfinityIcon,
  Loader2,
  PackageCheck,
  Receipt,
  RefreshCw,
  Store,
  TicketCheck,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { useMyBalance } from "@/components/use-my-balance";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import { CopyButton, DynIcon, EmptyState, ErrorState, PageHeader, Points, Skeleton, TxLink } from "@/components/ui/misc";
import { useApi } from "@/lib/use-api";
import { explorerTx } from "@/lib/chain";
import type { Redemption, StoreItem } from "@/lib/types";
import { cn, fmt, timeAgo } from "@/lib/utils";

type Tab = "rewards" | "mine";

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: Math.min(i, 10) * 0.04, duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ------------------------------------------------------------------ */
/*                               Page                                  */
/* ------------------------------------------------------------------ */
export default function StorePage() {
  const [tab, setTab] = useState<Tab>("rewards");
  const items = useApi<StoreItem[]>("/api/store/items");
  const mine = useApi<Redemption[]>("/api/redemptions/mine");
  const bal = useMyBalance();
  const w = useWallet();
  const balance = bal.crp === null ? null : Number(bal.crp);
  const [selected, setSelected] = useState<StoreItem | null>(null);

  const pendingCount = useMemo(() => (mine.data ?? []).filter((r) => r.status === "pending").length, [mine.data]);

  const onRedeemed = useCallback(() => {
    items.reload();
    mine.reload();
    void bal.refresh();
  }, [items, mine, bal]);

  return (
    <div>
      <PageHeader
        eyebrow="Reward store"
        title="Spend your CRP"
        description="Redeeming burns points on-chain and issues a voucher code you can show at the counter."
        actions={<BalancePill balance={balance} loading={bal.loading} hasAddress={!!bal.address} />}
      />

      <div className="mb-5 flex items-center justify-between gap-3">
        <Tabs<Tab>
          items={[
            { value: "rewards", label: "Rewards", count: items.data?.length },
            { value: "mine", label: "My redemptions", count: mine.data ? mine.data.length : undefined },
          ]}
          value={tab}
          onChange={setTab}
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh"
          onClick={() => (tab === "rewards" ? items.reload() : mine.reload())}
        >
          <RefreshCw className={cn("size-4", (tab === "rewards" ? items.loading : mine.loading) && "animate-spin")} />
        </Button>
      </div>

      {tab === "rewards" ? (
        <RewardsGrid
          items={items.data}
          loading={items.loading}
          error={items.error}
          onRetry={items.reload}
          balance={balance}
          hasAddress={!!bal.address}
          onSelect={setSelected}
          onConnect={() => void w.connect()}
        />
      ) : (
        <RedemptionsList
          data={mine.data}
          loading={mine.loading}
          error={mine.error}
          onRetry={mine.reload}
          pendingCount={pendingCount}
          onBrowse={() => setTab("rewards")}
        />
      )}

      <RedeemDialog
        item={selected}
        balance={balance}
        onClose={() => setSelected(null)}
        onRedeemed={onRedeemed}
        onViewMine={() => {
          setSelected(null);
          setTab("mine");
        }}
      />
    </div>
  );
}

function BalancePill({ balance, loading, hasAddress }: { balance: number | null; loading: boolean; hasAddress: boolean }) {
  return (
    <div className="surface-card flex items-center gap-3 rounded-2xl px-4 py-2.5">
      <div className="relative grid size-9 place-items-center rounded-xl border border-line bg-elevated">
        <div className="absolute inset-0 rounded-xl bg-gold-gradient opacity-15 blur-md" />
        <Coins className="relative size-4 text-gold" />
      </div>
      <div>
        <div className="text-[11px] text-subtle">Your balance</div>
        {!hasAddress ? (
          <div className="text-sm text-muted">No wallet</div>
        ) : loading || balance === null ? (
          <Skeleton className="mt-1 h-5 w-20" />
        ) : (
          <Points value={balance} className="text-base text-fg" />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*                            Rewards grid                             */
/* ------------------------------------------------------------------ */
function StockBadge({ stock }: { stock: number | null }) {
  if (stock === null || stock === undefined)
    return (
      <Badge tone="neutral">
        <InfinityIcon className="size-3" /> Unlimited
      </Badge>
    );
  if (stock <= 0) return <Badge tone="danger">Out of stock</Badge>;
  if (stock <= 5)
    return (
      <Badge tone="warning" dot>
        Only {fmt(stock)} left
      </Badge>
    );
  return <Badge tone="success">{fmt(stock)} in stock</Badge>;
}

function RewardsGrid({
  items,
  loading,
  error,
  onRetry,
  balance,
  hasAddress,
  onSelect,
  onConnect,
}: {
  items: StoreItem[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  balance: number | null;
  hasAddress: boolean;
  onSelect: (i: StoreItem) => void;
  onConnect: () => void;
}) {
  if (error && !items) return <ErrorState message={error} onRetry={onRetry} />;
  if (!items && loading)
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="surface-card rounded-2xl p-5">
            <div className="flex items-start justify-between">
              <Skeleton className="size-11 rounded-xl" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="mt-5 h-4 w-2/3" />
            <Skeleton className="mt-2 h-3 w-full" />
            <Skeleton className="mt-1.5 h-3 w-4/5" />
            <div className="mt-6 flex items-center justify-between">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-9 w-24 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    );
  if (!items || items.length === 0)
    return (
      <Card>
        <EmptyState
          icon={Store}
          title="The store is empty right now"
          description="New rewards are added by the admin. Check back soon."
        />
      </Card>
    );

  const sorted = [...items].sort((a, b) => a.cost - b.cost);
  return (
    <motion.div initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((it, i) => {
        const out = it.stock !== null && it.stock !== undefined && it.stock <= 0;
        const short = balance !== null && balance < it.cost;
        const needsWallet = balance === null && !hasAddress;
        const disabled = out || short || (balance === null && hasAddress);
        const progress = balance === null ? 0 : Math.min(1, balance / it.cost);
        return (
          <motion.div key={it.id} custom={i} variants={fadeUp}>
            <motion.article
              whileHover={disabled ? undefined : { y: -3 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className={cn(
                "surface-card group relative flex h-full flex-col overflow-hidden rounded-2xl p-5 transition-colors",
                !disabled && "hover:border-line-strong",
              )}
            >
              <div
                className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-accent-gradient opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-[0.12]"
                aria-hidden
              />
              <div className="relative flex items-start justify-between gap-3">
                <div className="relative grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-elevated text-fg">
                  <div className="absolute inset-0 rounded-xl bg-accent-gradient opacity-[0.12] blur-md" />
                  <DynIcon name={it.icon} fallback={Gift} className="relative size-5 text-accent" />
                </div>
                <StockBadge stock={it.stock} />
              </div>
              <h3 className="relative mt-4 text-[15px] font-semibold tracking-tight text-fg">{it.name}</h3>
              <p className="relative mt-1 line-clamp-3 flex-1 text-sm leading-relaxed text-muted">
                {it.description || "No description provided."}
              </p>

              {short && !out && (
                <div className="relative mt-4">
                  <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full bg-accent-gradient" style={{ width: `${progress * 100}%` }} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-subtle">
                    {fmt(it.cost - (balance ?? 0))} CRP more to unlock
                  </p>
                </div>
              )}

              <div className="relative mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
                <div>
                  <div className="text-[11px] text-subtle">Cost</div>
                  <Points value={it.cost} className="text-lg text-fg" />
                </div>
                <Button
                  size="md"
                  variant={disabled ? "secondary" : "primary"}
                  disabled={disabled}
                  onClick={() => (needsWallet ? onConnect() : onSelect(it))}
                  aria-label={needsWallet ? "Connect wallet" : `Redeem ${it.name}`}
                >
                  {out ? "Sold out" : short ? "Not enough CRP" : needsWallet ? "Connect wallet" : "Redeem"}
                </Button>
              </div>
            </motion.article>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*                            Redeem dialog                            */
/* ------------------------------------------------------------------ */
type Phase = "confirm" | "pending" | "success";

function RedeemDialog({
  item,
  balance,
  onClose,
  onRedeemed,
  onViewMine,
}: {
  item: StoreItem | null;
  balance: number | null;
  onClose: () => void;
  onRedeemed: () => void;
  onViewMine: () => void;
}) {
  const w = useWallet();
  const { profile } = useAuth();
  const [phase, setPhase] = useState<Phase>("confirm");
  const [result, setResult] = useState<{ hash: string; redemption: Redemption | null } | null>(null);
  // Keep the last item visible during the exit animation; reset the flow when a new item opens.
  const [shown, setShown] = useState<StoreItem | null>(item);
  if (item && item !== shown) {
    setShown(item);
    setPhase("confirm");
    setResult(null);
  }
  const it = item ?? shown;

  const linked = profile?.wallet_address?.toLowerCase() ?? null;
  const mismatch = Boolean(linked && w.address && linked !== w.address);

  const redeem = async () => {
    if (!it) return;
    setPhase("pending");
    const r = await w.sendContractTx({
      method: "redeem",
      args: [BigInt(it.cost), BigInt(it.id)],
      label: `Redeem ${it.name}`,
    });
    if (!r) {
      setPhase("confirm");
      return;
    }
    setResult({ hash: r.hash, redemption: r.record?.redemption ?? null });
    setPhase("success");
    onRedeemed();
  };

  const close = () => {
    if (phase === "pending") return;
    onClose();
  };

  const after = balance !== null && it ? balance - it.cost : null;

  return (
    <Dialog
      open={!!item}
      onClose={close}
      dismissable={phase !== "pending"}
      title={phase === "success" ? "Redemption confirmed" : it ? `Redeem ${it.name}` : "Redeem"}
      description={
        phase === "success"
          ? "Show this voucher code to claim your reward."
          : "This burns CRP from your wallet. It can't be undone."
      }
      footer={
        phase === "success" ? (
          <>
            <Button variant="secondary" onClick={onViewMine}>
              <Receipt className="size-4" /> My redemptions
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={close} disabled={phase === "pending"}>
              Cancel
            </Button>
            <Button onClick={redeem} loading={phase === "pending"} disabled={after !== null && after < 0}>
              {phase === "pending" ? "Redeeming…" : <>Confirm & redeem</>}
            </Button>
          </>
        )
      }
    >
      {it && phase !== "success" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-black/20 p-3.5">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-elevated">
              <DynIcon name={it.icon} fallback={Gift} className="size-5 text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-fg">{it.name}</div>
              {it.description && <div className="truncate text-xs text-muted">{it.description}</div>}
            </div>
          </div>

          <dl className="space-y-2.5 rounded-2xl border border-line p-4 text-sm">
            <Row label="Current balance">{balance === null ? "—" : <Points value={balance} />}</Row>
            <Row label="Cost">
              <span className="inline-flex items-center gap-1 text-red-300">
                <Flame className="size-3.5" />
                <Points value={it.cost} sign="-" />
              </span>
            </Row>
            <div className="border-t border-line" />
            <Row label="Balance after">
              {after === null ? "—" : <Points value={after} className={after < 0 ? "text-red-300" : "text-fg"} />}
            </Row>
          </dl>

          {mismatch && (
            <p className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] px-3 py-2.5 text-xs text-cyan-100">
              The connected MetaMask account differs from your linked wallet. The voucher is tied to the wallet that
              signs this transaction.
            </p>
          )}
          {!linked && (
            <p className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2.5 text-xs text-amber-100">
              No wallet is linked to your account yet.{" "}
              <Link href="/profile" className="underline underline-offset-2">
                Link it on your profile
              </Link>{" "}
              so this voucher appears in your history.
            </p>
          )}

          {phase === "pending" && (
            <div className="flex items-center gap-2.5 rounded-xl border border-line bg-elevated px-3 py-2.5 text-xs text-muted">
              <Loader2 className="size-4 animate-spin text-accent" />
              Confirm in MetaMask, then wait for Sepolia (~12 s) while we issue your voucher…
            </div>
          )}
        </div>
      )}

      {phase === "success" && result && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 26 }}
          className="space-y-4"
        >
          <div className="flex justify-center">
            <div className="relative grid size-14 place-items-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10">
              <div className="absolute inset-0 rounded-2xl bg-emerald-400/20 blur-xl" />
              <CheckCircle2 className="relative size-7 text-emerald-300" />
            </div>
          </div>
          {result.redemption?.code ? (
            <div className="relative overflow-hidden rounded-2xl border border-line-strong bg-black/40 p-5 text-center">
              <div className="pointer-events-none absolute inset-0 bg-accent-gradient opacity-[0.07]" aria-hidden />
              <div className="relative text-[11px] font-medium uppercase tracking-[0.18em] text-subtle">Voucher code</div>
              <div className="relative mt-2 flex items-center justify-center gap-2">
                <span className="break-all font-mono text-3xl font-semibold tracking-[0.2em] text-fg sm:text-4xl">
                  {result.redemption.code}
                </span>
                <CopyButton text={result.redemption.code} label="Copy voucher code" className="size-8" />
              </div>
              <div className="relative mt-3 flex justify-center">
                <StatusBadge status={result.redemption.status} />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-center text-sm text-amber-100">
              Your points were burned on-chain. The voucher code will appear under{" "}
              <span className="font-medium">My redemptions</span> once the indexer catches up.
            </div>
          )}
          <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-2.5 text-xs">
            <span className="text-muted">Transaction</span>
            <TxLink hash={result.hash} />
          </div>
        </motion.div>
      )}
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*                           My redemptions                            */
/* ------------------------------------------------------------------ */
function RedemptionsList({
  data,
  loading,
  error,
  onRetry,
  pendingCount,
  onBrowse,
}: {
  data: Redemption[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  pendingCount: number;
  onBrowse: () => void;
}) {
  if (error && !data) return <ErrorState message={error} onRetry={onRetry} />;
  if (!data && loading)
    return (
      <div className="space-y-3" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="surface-card flex items-center gap-4 rounded-2xl p-4">
            <Skeleton className="size-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="hidden h-8 w-28 rounded-lg sm:block" />
          </div>
        ))}
      </div>
    );
  if (!data || data.length === 0)
    return (
      <Card>
        <EmptyState
          icon={TicketCheck}
          title="No redemptions yet"
          description="Vouchers you redeem from the store will show up here with their codes and status."
          action={
            <Button onClick={onBrowse} variant="secondary">
              Browse rewards <ArrowRight className="size-4" />
            </Button>
          }
        />
      </Card>
    );

  const sorted = [...data].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return (
    <div className="space-y-4">
      {pendingCount > 0 && (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3 text-sm text-amber-100">
          <PackageCheck className="size-4 shrink-0" />
          {pendingCount} voucher{pendingCount === 1 ? " is" : "s are"} waiting to be fulfilled. Show the code at the
          counter to collect.
        </div>
      )}
      <motion.ul initial="hidden" animate="show" className="space-y-3">
        {sorted.map((r, i) => (
          <motion.li key={r.id} custom={i} variants={fadeUp}>
            <div className="surface-card flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3.5">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-elevated">
                  <DynIcon name={r.item?.icon} fallback={Gift} className="size-[18px] text-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-fg">{r.item?.name ?? "Store item"}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <Points value={r.amount} sign="-" className="text-muted" />
                    <span className="inline-flex items-center gap-1" title={fmtDate(r.created_at)}>
                      <CalendarClock className="size-3" /> {timeAgo(r.created_at)}
                    </span>
                    {r.fulfilled_at && (
                      <span className="inline-flex items-center gap-1" title={fmtDate(r.fulfilled_at)}>
                        <CheckCircle2 className={cn("size-3", r.status === "rejected" ? "text-red-300" : "text-emerald-300")} />
                        {r.status === "rejected" ? "Rejected" : "Fulfilled"} {fmtDate(r.fulfilled_at)}
                      </span>
                    )}
                    {r.tx_hash && <TxLink hash={r.tx_hash} />}
                  </div>
                </div>
              </div>
              <div
                className={cn(
                  "flex items-center justify-between gap-2 rounded-xl border border-line bg-black/30 py-1.5 pl-3 pr-1.5 sm:justify-start",
                  r.status === "rejected" && "opacity-60",
                )}
              >
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-subtle">Code</span>
                <span
                  className={cn(
                    "font-mono text-sm font-semibold tracking-[0.16em] text-fg",
                    r.status === "rejected" && "line-through",
                  )}
                >
                  {r.code}
                </span>
                <CopyButton text={r.code} label="Copy voucher code" />
              </div>
            </div>
          </motion.li>
        ))}
      </motion.ul>
      <p className="flex flex-wrap items-center gap-1.5 px-1 text-xs text-subtle">
        <Wallet className="size-3.5" /> Every redemption is a public burn on Sepolia.
        {sorted[0]?.tx_hash && (
          <a
            href={explorerTx(sorted[0].tx_hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted hover:text-accent-2"
          >
            View latest on Etherscan
          </a>
        )}
      </p>
    </div>
  );
}
