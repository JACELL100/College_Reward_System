"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Crown,
  Info,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldMinus,
  ShieldPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { RoleGuard } from "@/components/app-shell";
import { displayName } from "@/components/providers/auth-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { useContractState } from "@/components/onchain-hooks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, RoleBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { AddressChip, Avatar, EmptyState, ErrorState, PageHeader, Points, Skeleton } from "@/components/ui/misc";
import { useApi } from "@/lib/use-api";
import { readIsIssuer } from "@/lib/chain";
import { isContractConfigured } from "@/lib/env";
import type { AdminUser, Role } from "@/lib/types";
import { cn, fmt, shortAddr } from "@/lib/utils";

type RoleFilter = "all" | Role;

/** Reads isIssuer(wallet) for every wallet in the list. Missing key = still loading; null = RPC error. */
function useIssuerMap(wallets: string[], tick: number) {
  const [map, setMap] = useState<Record<string, boolean | null>>({});
  const key = wallets.join(",");
  useEffect(() => {
    if (!isContractConfigured || !key) return;
    let cancelled = false;
    const list = key.split(",");
    Promise.all(
      list.map(async (w) => {
        try {
          return [w, await readIsIssuer(w)] as const;
        } catch {
          return [w, null] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setMap((prev) => {
        const next = { ...prev };
        for (const [w, v] of entries) next[w] = v;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [key, tick]);
  return map;
}

function IssuersPage() {
  const wallet = useWallet();
  const contract = useContractState();
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [chainTick, setChainTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const path = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (role !== "all") p.set("role", role);
    const s = p.toString();
    return `/api/admin/users${s ? `?${s}` : ""}`;
  }, [q, role]);

  const { data, error, loading, reload } = useApi<AdminUser[]>(path);
  const users = useMemo(() => data ?? [], [data]);

  const wallets = useMemo(
    () => Array.from(new Set(users.map((u) => u.wallet_address?.toLowerCase()).filter((w): w is string => !!w))),
    [users],
  );
  const issuerMap = useIssuerMap(wallets, chainTick);

  const owner = contract.state?.owner ?? null;
  const me = wallet.address?.toLowerCase() ?? null;
  const isOwner = !!me && !!owner && me === owner;

  const reloadContract = contract.reload;
  const refreshAll = useCallback(() => {
    reload();
    reloadContract();
    setChainTick((t) => t + 1);
  }, [reload, reloadContract]);

  const act = async (u: AdminUser, grant: boolean) => {
    if (!u.wallet_address) return;
    const w = u.wallet_address.toLowerCase();
    setBusy(w);
    const name = displayName(u);
    const r = await wallet.sendContractTx({
      method: grant ? "addIssuer" : "removeIssuer",
      args: [u.wallet_address],
      label: grant ? `Grant issuer to ${name}` : `Revoke issuer from ${name}`,
      record: true,
    });
    setBusy(null);
    if (r) refreshAll();
  };

  const issuerCount = wallets.filter((w) => issuerMap[w] === true).length;

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Issuers & users"
        description="Grant or revoke on-chain minting rights. The blockchain is the source of truth: roles refresh automatically after each confirmed transaction."
        actions={
          <Button variant="secondary" onClick={refreshAll} disabled={loading}>
            <RefreshCw className={cn("size-4", loading && "animate-spin")} /> Refresh
          </Button>
        }
      />

      <OwnerBanner
        owner={owner}
        ownerLoading={contract.loading && !contract.state}
        ownerError={contract.error}
        isOwner={isOwner}
        address={me}
        connecting={wallet.connecting}
        onConnect={() => void wallet.connect()}
        onRetry={contract.reload}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email or wallet…"
            aria-label="Search users"
            className="pl-9 pr-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-subtle hover:bg-white/5 hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Tabs<RoleFilter>
          size="sm"
          value={role}
          onChange={setRole}
          items={[
            { value: "all", label: "All" },
            { value: "student", label: "Students" },
            { value: "issuer", label: "Issuers" },
            { value: "admin", label: "Admins" },
          ]}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 text-xs text-muted">
          <span>
            {loading && !data ? (
              <Skeleton className="h-3.5 w-24" />
            ) : (
              <>
                {fmt(users.length)} user{users.length === 1 ? "" : "s"}
                {users.length >= 100 && <span className="text-subtle"> · showing first 100</span>}
              </>
            )}
          </span>
          {isContractConfigured && data && wallets.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-violet-300" /> {fmt(issuerCount)} on-chain issuer
              {issuerCount === 1 ? "" : "s"} in view
            </span>
          )}
        </div>
        <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto] gap-4 border-b border-line/60 px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.1em] text-subtle lg:grid">
          <span>User</span>
          <span>Wallet</span>
          <span className="text-right">Balance</span>
          <span>On-chain</span>
          <span className="w-[132px] text-right">Action</span>
        </div>

        {error && !data ? (
          <div className="p-5">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : loading && !data ? (
          <RowsSkeleton />
        ) : users.length === 0 ? (
          <EmptyState
            icon={Users}
            title={q || role !== "all" ? "No users match" : "No users yet"}
            description={
              q || role !== "all"
                ? "Try a different search term or role filter."
                : "Users appear here after they sign in for the first time."
            }
            action={
              q || role !== "all" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setRole("all");
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className={cn("divide-y divide-line/60 transition-opacity", loading && "opacity-60")}>
            {users.map((u, i) => {
              const w = u.wallet_address?.toLowerCase() ?? null;
              const onchain = w ? issuerMap[w] : undefined;
              const rowIsOwner = !!w && !!owner && w === owner;
              return (
                <motion.li
                  key={u.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 12) * 0.025 }}
                  className="grid grid-cols-1 gap-3 px-5 py-4 transition-colors hover:bg-white/[0.015] lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar src={u.avatar_url} name={displayName(u)} seed={w ?? u.id} size={36} />
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate text-sm font-medium text-fg">{displayName(u)}</span>
                        {rowIsOwner ? (
                          <Badge tone="gold">
                            <Crown className="size-3" /> Owner
                          </Badge>
                        ) : (
                          <RoleBadge role={u.role} />
                        )}
                      </div>
                      <div className="truncate text-xs text-muted" title={u.email}>
                        {u.email}
                        {u.department && <span className="text-subtle"> · {u.department}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 lg:block">
                    <span className="text-xs text-subtle lg:hidden">Wallet</span>
                    {u.wallet_address ? (
                      <AddressChip address={u.wallet_address} />
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-subtle">
                        <Wallet className="size-3.5" /> No wallet linked
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 lg:block lg:text-right">
                    <span className="text-xs text-subtle lg:hidden">Balance</span>
                    <Points value={u.balance ?? 0} className="text-sm text-fg" />
                  </div>

                  <div className="flex items-center justify-between gap-3 lg:block">
                    <span className="text-xs text-subtle lg:hidden">On-chain</span>
                    <OnchainStatus wallet={w} value={onchain} isOwner={rowIsOwner} />
                  </div>

                  <div className="lg:w-[132px] lg:text-right">
                    <RowAction
                      user={u}
                      wallet={w}
                      onchain={onchain}
                      rowIsOwner={rowIsOwner}
                      canAct={isOwner}
                      busy={busy}
                      onAct={act}
                    />
                  </div>
                </motion.li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function OnchainStatus({
  wallet,
  value,
  isOwner,
}: {
  wallet: string | null;
  value: boolean | null | undefined;
  isOwner: boolean;
}) {
  if (!wallet) return <span className="text-xs text-subtle">—</span>;
  if (!isContractConfigured) return <span className="text-xs text-subtle">Contract not set</span>;
  if (value === undefined) return <Skeleton className="h-5 w-20 rounded-full" />;
  if (value === null) return <Badge tone="warning">Unknown</Badge>;
  if (value)
    return (
      <Badge tone="accent" dot>
        {isOwner ? "Issuer (owner)" : "Issuer"}
      </Badge>
    );
  return <Badge tone="neutral">Not issuer</Badge>;
}

function RowAction({
  user,
  wallet,
  onchain,
  rowIsOwner,
  canAct,
  busy,
  onAct,
}: {
  user: AdminUser;
  wallet: string | null;
  onchain: boolean | null | undefined;
  rowIsOwner: boolean;
  canAct: boolean;
  busy: string | null;
  onAct: (u: AdminUser, grant: boolean) => void;
}) {
  if (!wallet) return <span className="text-xs text-subtle lg:inline-block">Link wallet first</span>;
  if (rowIsOwner) return <span className="text-xs text-subtle">Always an issuer</span>;
  if (!isContractConfigured || onchain === undefined || onchain === null)
    return (
      <Button size="sm" variant="secondary" disabled className="w-full lg:w-auto">
        {onchain === undefined && isContractConfigured ? "Checking…" : "Unavailable"}
      </Button>
    );
  const mine = busy === wallet;
  const title = canAct ? undefined : "Connect the contract owner wallet to change roles";
  return onchain ? (
    <Button
      size="sm"
      variant="danger"
      className="w-full lg:w-auto"
      onClick={() => onAct(user, false)}
      loading={mine}
      disabled={!canAct || (busy !== null && !mine)}
      title={title}
    >
      {!mine && <ShieldMinus className="size-3.5" />} Revoke issuer
    </Button>
  ) : (
    <Button
      size="sm"
      variant="primary"
      className="w-full lg:w-auto"
      onClick={() => onAct(user, true)}
      loading={mine}
      disabled={!canAct || (busy !== null && !mine)}
      title={title}
    >
      {!mine && <ShieldPlus className="size-3.5" />} Grant issuer
    </Button>
  );
}

function OwnerBanner({
  owner,
  ownerLoading,
  ownerError,
  isOwner,
  address,
  connecting,
  onConnect,
  onRetry,
}: {
  owner: string | null;
  ownerLoading: boolean;
  ownerError: string | null;
  isOwner: boolean;
  address: string | null;
  connecting: boolean;
  onConnect: () => void;
  onRetry: () => void;
}) {
  if (!isContractConfigured)
    return (
      <Banner tone="warning" icon={Info} title="Contract not configured">
        Set <code className="font-mono">NEXT_PUBLIC_CONTRACT_ADDRESS</code> to manage issuers on-chain.
      </Banner>
    );
  if (ownerLoading)
    return (
      <div className="surface-card mb-5 flex items-center gap-3 rounded-2xl p-4">
        <Skeleton className="size-9 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3 w-64" />
        </div>
      </div>
    );
  if (ownerError && !owner)
    return (
      <Banner
        tone="warning"
        icon={Info}
        title="Couldn't read the contract owner"
        action={
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        }
      >
        {ownerError}
      </Banner>
    );
  if (isOwner)
    return (
      <Banner tone="success" icon={Crown} title="Owner wallet connected">
        You can grant and revoke issuer rights. Each change is a Sepolia transaction confirmed in MetaMask.
      </Banner>
    );
  return (
    <Banner
      tone="info"
      icon={ShieldCheck}
      title={address ? "Connected wallet is not the contract owner" : "Connect the owner wallet"}
      action={
        !address ? (
          <Button size="sm" variant="secondary" onClick={onConnect} loading={connecting}>
            {!connecting && <Wallet className="size-3.5" />} Connect wallet
          </Button>
        ) : undefined
      }
    >
      Only the owner{" "}
      {owner ? (
        <span className="font-mono text-fg" title={owner}>
          {shortAddr(owner, 4)}
        </span>
      ) : null}{" "}
      can call <code className="font-mono">addIssuer</code> / <code className="font-mono">removeIssuer</code>.
      {address ? (
        <>
          {" "}
          You&apos;re connected as{" "}
          <span className="font-mono text-fg" title={address}>
            {shortAddr(address, 4)}
          </span>
          . Switch accounts in MetaMask to make changes.
        </>
      ) : (
        " Connect it in MetaMask to make changes."
      )}
    </Banner>
  );
}

const BANNER_TONES = {
  info: { box: "border-cyan-500/15 bg-cyan-500/[0.04]", icon: "text-cyan-300" },
  success: { box: "border-emerald-500/15 bg-emerald-500/[0.04]", icon: "text-emerald-300" },
  warning: { box: "border-amber-500/15 bg-amber-500/[0.05]", icon: "text-amber-300" },
} as const;

function Banner({
  tone,
  icon: Icon,
  title,
  action,
  children,
}: {
  tone: keyof typeof BANNER_TONES;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "mb-5 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center",
        BANNER_TONES[tone].box,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-elevated",
            BANNER_TONES[tone].icon,
          )}
        >
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-fg">{title}</div>
          <div className="mt-0.5 text-xs leading-relaxed text-muted">{children}</div>
        </div>
      </div>
      {action && <div className="shrink-0 sm:ml-auto">{action}</div>}
    </motion.div>
  );
}

function RowsSkeleton() {
  return (
    <div className="divide-y divide-line/60" aria-busy="true" aria-label="Loading users">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-1 gap-3 px-5 py-4 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-4"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          </div>
          <Skeleton className="hidden h-6 w-32 lg:block" />
          <Skeleton className="hidden h-4 w-16 justify-self-end lg:block" />
          <Skeleton className="hidden h-5 w-20 rounded-full lg:block" />
          <Skeleton className="hidden h-8 w-[132px] lg:block" />
        </div>
      ))}
    </div>
  );
}

export default function AdminIssuersPage() {
  return (
    <RoleGuard roles={["admin"]}>
      <IssuersPage />
    </RoleGuard>
  );
}
