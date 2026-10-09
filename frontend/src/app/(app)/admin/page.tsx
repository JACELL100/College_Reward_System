"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  Activity as ActivityIcon,
  ArrowRight,
  Coins,
  Flame,
  Gift,
  GraduationCap,
  Pause,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { RoleGuard } from "@/components/app-shell";
import { useAuth } from "@/components/providers/auth-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { ActivityList } from "@/components/activity-list";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, RoleBadge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import {
  AddressChip,
  Avatar,
  EmptyState,
  ErrorState,
  ListSkeleton,
  PageHeader,
  Skeleton,
  StatCard,
} from "@/components/ui/misc";
import { api, errMsg } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { readContractState, explorerToken, CONTRACT_ADDRESS, type ContractState } from "@/lib/chain";
import { isContractConfigured } from "@/lib/env";
import type { AdminOverview } from "@/lib/types";
import { fmt } from "@/lib/utils";

function useContractState() {
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

function AdminOverviewPage() {
  const { profile } = useAuth();
  const { data, error, loading, reload } = useApi<AdminOverview>("/api/admin/overview");
  const [syncing, setSyncing] = useState(false);

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await api.post<{ from_block: number; to_block: number; events_indexed: number }>(
        "/api/admin/sync",
        {},
        { timeoutMs: 120_000 },
      );
      toast.success(`Indexed ${fmt(r.events_indexed)} event${r.events_indexed === 1 ? "" : "s"}`, {
        description: `Blocks #${fmt(r.from_block)} → #${fmt(r.to_block)}`,
      });
      reload();
    } catch (e) {
      toast.error("Sync failed", { description: errMsg(e) });
    } finally {
      setSyncing(false);
    }
  };

  const s = data?.stats;
  const stats = [
    { label: "Total supply", value: s?.total_supply, icon: Coins },
    { label: "Total issued", value: s?.total_issued, icon: Sparkles },
    { label: "Total redeemed", value: s?.total_redeemed, icon: Flame },
    { label: "Holders", value: s?.holders, icon: Wallet },
    { label: "Transactions", value: s?.transactions, icon: ActivityIcon },
    { label: "Students", value: s?.students, icon: GraduationCap },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Control center"
        description="Token health, issuers and on-chain contract settings at a glance."
        actions={
          <>
            <ButtonLink href="/admin/issue" variant="secondary">
              <Sparkles className="size-4" /> Issue rewards
            </ButtonLink>
            <Button onClick={sync} loading={syncing} variant="primary">
              {!syncing && <RefreshCw className="size-4" />} Sync chain
            </Button>
          </>
        }
      />

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
            {stats.map((st, i) => (
              <motion.div
                key={st.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <StatCard label={st.label} value={st.value ?? null} icon={st.icon} loading={loading && !data} />
              </motion.div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Link
                href="/admin/redemptions"
                className="surface-card group flex items-center gap-4 rounded-2xl p-5 transition-colors hover:border-line-strong"
              >
                <div className="relative grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-elevated">
                  <div className="absolute inset-0 rounded-xl bg-gold-gradient opacity-15 blur-md" />
                  <Gift className="relative size-5 text-gold" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-fg">Pending redemptions</div>
                  <div className="text-xs text-muted">Vouchers waiting to be fulfilled or rejected</div>
                </div>
                {loading && !data ? (
                  <Skeleton className="h-7 w-10" />
                ) : (
                  <span className="font-mono text-2xl font-semibold tabular text-fg">
                    {fmt(data?.pending_redemptions ?? 0)}
                  </span>
                )}
                <ArrowRight className="size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
              </Link>

              <Card>
                <CardHeader
                  title="Recent activity"
                  description="Latest indexed on-chain events"
                  icon={<ActivityIcon className="size-4" />}
                />
                <CardBody className="pt-3">
                  {loading && !data ? (
                    <ListSkeleton rows={6} />
                  ) : data && data.recent.length > 0 ? (
                    <ActivityList items={data.recent} me={profile?.wallet_address} />
                  ) : (
                    <EmptyState
                      icon={ActivityIcon}
                      title="No activity yet"
                      description="Issue the first reward or run a chain sync to index existing events."
                    />
                  )}
                </CardBody>
              </Card>
            </div>

            <div className="space-y-6">
              <ContractCard />
              <Card>
                <CardHeader
                  title="Issuers"
                  description="Wallets allowed to mint rewards"
                  icon={<Users className="size-4" />}
                  action={
                    <ButtonLink href="/admin/issuers" variant="ghost" size="sm">
                      Manage
                    </ButtonLink>
                  }
                />
                <CardBody className="pt-3">
                  {loading && !data ? (
                    <ListSkeleton rows={3} />
                  ) : data && data.issuers.length > 0 ? (
                    <ul className="divide-y divide-line/60">
                      {data.issuers.map((p) => (
                        <li key={p.id} className="flex items-center gap-3 py-2.5">
                          <Avatar src={p.avatar_url} name={p.full_name ?? p.email} seed={p.wallet_address} size={32} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">{p.full_name ?? p.email}</span>
                              {p.is_contract_owner ? <Badge tone="gold">Owner</Badge> : <RoleBadge role={p.role} />}
                            </div>
                            <div className="mt-1">
                              {p.wallet_address ? (
                                <AddressChip address={p.wallet_address} />
                              ) : (
                                <span className="text-xs text-subtle">No wallet</span>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      icon={Users}
                      title="No issuers yet"
                      description="Promote faculty wallets from the issuers page."
                      className="py-8"
                    />
                  )}
                </CardBody>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ContractCard() {
  const { address, connect, connecting } = useWallet();
  const { state, loading, error, reload } = useContractState();
  const [busy, setBusy] = useState<null | "pause" | "max">(null);
  const [maxInput, setMaxInput] = useState("");
  const isOwner = !!address && !!state && address.toLowerCase() === state.owner;

  if (!isContractConfigured) {
    return (
      <Card>
        <CardHeader title="Contract" icon={<ShieldCheck className="size-4" />} />
        <CardBody>
          <EmptyState
            icon={Settings2}
            title="Contract not configured"
            description="Set NEXT_PUBLIC_CONTRACT_ADDRESS to enable on-chain controls."
            className="py-6"
          />
        </CardBody>
      </Card>
    );
  }

  const togglePause = async () => {
    if (!state) return;
    setBusy("pause");
    const r = await sendTx(state.paused ? "unpause" : "pause", [], state.paused ? "Unpause contract" : "Pause contract");
    setBusy(null);
    if (r) reload();
  };

  const setMax = async () => {
    const n = Number(maxInput);
    if (!Number.isInteger(n) || n < 1) {
      toast.error("Enter a whole number greater than 0");
      return;
    }
    setBusy("max");
    const r = await sendTx("setMaxIssuePerTx", [BigInt(n)], `Set max issue to ${fmt(n)} CRP`);
    setBusy(null);
    if (r) {
      setMaxInput("");
      reload();
    }
  };

  return (
    <Card>
      <CardHeader
        title="Contract status"
        description="Read live from Sepolia"
        icon={<ShieldCheck className="size-4" />}
        action={
          <Button variant="ghost" size="icon" onClick={reload} aria-label="Refresh contract state" disabled={loading}>
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
          </Button>
        }
      />
      <CardBody className="space-y-4 pt-4">
        {error && !state ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !state ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : (
          <>
            <dl className="space-y-3 text-sm">
              <Row label="Address">
                <a
                  href={explorerToken(CONTRACT_ADDRESS)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-muted hover:text-accent-2"
                >
                  {CONTRACT_ADDRESS.slice(0, 8)}…{CONTRACT_ADDRESS.slice(-6)}
                </a>
              </Row>
              <Row label="Owner">
                <AddressChip address={state.owner} />
              </Row>
              <Row label="Status">
                {state.paused ? (
                  <Badge tone="danger" dot>
                    Paused
                  </Badge>
                ) : (
                  <Badge tone="success" dot>
                    Active
                  </Badge>
                )}
              </Row>
              <Row label="Max issue / tx">
                <span className="font-mono tabular">{fmt(state.maxIssuePerTx)} CRP</span>
              </Row>
              <Row label="Total issued">
                <span className="font-mono tabular">{fmt(state.totalIssued)}</span>
              </Row>
              <Row label="Total redeemed">
                <span className="font-mono tabular">{fmt(state.totalRedeemed)}</span>
              </Row>
            </dl>

            <div className="border-t border-line pt-4">
              {isOwner ? (
                <div className="space-y-4">
                  <Button
                    variant={state.paused ? "primary" : "danger"}
                    className="w-full"
                    onClick={togglePause}
                    loading={busy === "pause"}
                    disabled={busy !== null && busy !== "pause"}
                  >
                    {busy !== "pause" && (state.paused ? <Play className="size-4" /> : <Pause className="size-4" />)}
                    {state.paused ? "Unpause contract" : "Pause contract"}
                  </Button>
                  <Field label="Set max issue per tx" hint="Applies per recipient for every issuance.">
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step={1}
                        placeholder={String(state.maxIssuePerTx)}
                        value={maxInput}
                        onChange={(e) => setMaxInput(e.target.value)}
                        className="font-mono"
                      />
                      <Button
                        variant="secondary"
                        onClick={setMax}
                        loading={busy === "max"}
                        disabled={!maxInput || (busy !== null && busy !== "max")}
                      >
                        Update
                      </Button>
                    </div>
                  </Field>
                </div>
              ) : (
                <div className="rounded-xl border border-line bg-black/20 p3 p-3 text-xs text-muted">
                  <p>Connect the owner wallet to change contract settings.</p>
                  {!address && (
                    <Button size="sm" variant="secondary" className="mt-3" onClick={() => void connect()} loading={connecting}>
                      <Wallet className="size-3.5" /> Connect wallet
                    </Button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );

  async function sendTx(method: string, args: unknown[], label: string) {
    return sendContractTxRef(method, args, label);
  }
}

// Small indirection so sendContractTx is read via hook in the component tree.
let sendContractTxRef: (method: string, args: unknown[], label: string) => Promise<unknown> = async () => null;

function TxBridge() {
  const { sendContractTx } = useWallet();
  useEffect(() => {
    sendContractTxRef = (method, args, label) => sendContractTx({ method, args, label, record: true });
  }, [sendContractTx]);
  return null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

export default function AdminPage() {
  return (
    <RoleGuard roles={["admin"]}>
      <TxBridge />
      <AdminOverviewPage />
    </RoleGuard>
  );
}
