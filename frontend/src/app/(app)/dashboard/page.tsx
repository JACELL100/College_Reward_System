"use client";
import Link from "next/link";
import { motion } from "motion/react";
import {
  Activity as ActivityIcon,
  ArrowRight,
  Bot,
  Fuel,
  Gift,
  RefreshCw,
  Send,
  Sparkles,
  Trophy,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { displayName, useAuth } from "@/components/providers/auth-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { useMyBalance } from "@/components/use-my-balance";
import { OnboardingChecklist } from "@/components/onboarding";
import { ActivityList } from "@/components/activity-list";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, RoleBadge } from "@/components/ui/badge";
import { AddressChip, CountUp, EmptyState, ErrorState, ListSkeleton, PageHeader, Skeleton } from "@/components/ui/misc";
import { useApi } from "@/lib/use-api";
import type { Activity, Leaderboard } from "@/lib/types";
import { cn, fmt, fmtEth } from "@/lib/utils";

const MIN_GAS_WEI = BigInt(5e14);
const ease = [0.16, 1, 0.3, 1] as const;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/* ------------------------------ Hero balance ------------------------------ */
function BalanceHero() {
  const w = useWallet();
  const { crp, eth, address, loading, refresh, source } = useMyBalance();
  const lowGas = eth !== null && eth < MIN_GAS_WEI;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease }}
      className="relative overflow-hidden rounded-2xl border border-line bg-surface p-5 sm:p-7"
    >
      {/* accent glow */}
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 size-72 rounded-full bg-accent-gradient opacity-25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 size-64 rounded-full bg-cyan-500/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid opacity-[0.35] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" />
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted">
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400" aria-hidden />
            On-chain balance
          </div>
          {address && (
            <Button variant="ghost" size="icon" onClick={() => void refresh()} aria-label="Refresh balance" className="-mr-2 -mt-2">
              <RefreshCw className="size-4" />
            </Button>
          )}
        </div>

        {address ? (
          <>
            <div className="mt-4 flex items-baseline gap-3">
              {loading ? (
                <Skeleton className="h-12 w-44 sm:h-14" />
              ) : (
                <span className="font-mono text-5xl font-semibold tracking-[-0.04em] text-fg sm:text-6xl">
                  <CountUp value={Number(crp ?? BigInt(0))} />
                </span>
              )}
              <span className="text-gradient text-lg font-semibold sm:text-xl">CRP</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <AddressChip address={address} />
              {source === "linked" && <Badge tone="neutral">Linked wallet</Badge>}
              {w.address && !w.isCorrectChain && (
                <Button size="sm" variant="secondary" onClick={() => void w.switchChain()}>
                  Switch to Sepolia
                </Button>
              )}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 border-t border-line pt-5 sm:max-w-md">
              <div>
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <Fuel className="size-3.5" /> Gas (Sepolia ETH)
                </div>
                <div className={cn("mt-1 font-mono text-sm tabular", lowGas ? "text-amber-300" : "text-fg")}>
                  {eth === null ? <Skeleton className="h-4 w-16" /> : `${fmtEth(eth)} ETH`}
                </div>
                {lowGas && <div className="mt-0.5 text-[11px] text-amber-300/80">Low, top up below</div>}
              </div>
              <div>
                <div className="text-xs text-muted">Network</div>
                <div className="mt-1 text-sm text-fg">Ethereum Sepolia</div>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-4">
            <p className="font-mono text-5xl font-semibold tracking-[-0.04em] text-subtle sm:text-6xl">—</p>
            <p className="mt-3 max-w-sm text-sm text-muted">
              Connect MetaMask to see your CampusCoin balance read live from the Sepolia blockchain.
            </p>
            <Button className="mt-5" onClick={() => void w.connect()} loading={w.connecting}>
              {!w.connecting && <Wallet className="size-4" />}
              {w.installed ? "Connect wallet" : w.isMobile ? "Open in MetaMask" : "Install MetaMask"}
            </Button>
          </div>
        )}
      </div>
    </motion.section>
  );
}

/* ------------------------------ Rank card ------------------------------ */
function RankCard() {
  const { data, loading, error, reload } = useApi<Leaderboard>("/api/leaderboard?limit=25");
  const me = data?.me ?? null;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.06, ease }}>
      <Link
        href="/leaderboard"
        className="surface-card group relative flex h-full flex-col overflow-hidden rounded-2xl p-5 transition-colors hover:border-line-strong"
      >
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-gold-gradient opacity-10 blur-2xl" />
        <div className="relative flex items-center justify-between text-xs text-muted">
          <span>Campus rank</span>
          <Trophy className="size-4 text-gold" aria-hidden />
        </div>
        {loading && !data ? (
          <div className="relative mt-4 space-y-3">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : error && !data ? (
          <div className="relative mt-4 text-xs text-muted">
            Couldn&apos;t load rank.{" "}
            <button
              className="text-accent-2 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                reload();
              }}
            >
              Retry
            </button>
          </div>
        ) : me ? (
          <div className="relative mt-3">
            <div className="flex items-baseline gap-1">
              <span className="text-lg text-subtle">#</span>
              <span className="font-mono text-4xl font-semibold tracking-tight text-fg">
                <CountUp value={me.rank} duration={0.8} />
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
              <div>
                <div className="text-[11px] text-subtle">Total earned</div>
                <div className="mt-0.5 font-mono text-sm tabular text-fg">{fmt(me.earned)}</div>
              </div>
              <div>
                <div className="text-[11px] text-subtle">Indexed balance</div>
                <div className="mt-0.5 font-mono text-sm tabular text-fg">{fmt(me.balance)}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative mt-3">
            <div className="font-mono text-4xl font-semibold text-subtle">—</div>
            <p className="mt-2 text-xs text-muted">Link your wallet and earn your first reward to join the leaderboard.</p>
          </div>
        )}
        <div className="relative mt-auto flex items-center gap-1 pt-4 text-xs text-muted group-hover:text-fg">
          View leaderboard <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>
    </motion.div>
  );
}

/* ------------------------------ Quick actions ------------------------------ */
const ACTIONS: { href: string; label: string; desc: string; icon: LucideIcon; tone: string }[] = [
  { href: "/send", label: "Send", desc: "Transfer to a classmate", icon: Send, tone: "text-cyan-300 bg-cyan-500/10 border-cyan-500/20" },
  { href: "/store", label: "Redeem", desc: "Spend in the campus store", icon: Gift, tone: "text-amber-300 bg-amber-500/10 border-amber-500/20" },
  { href: "/assistant", label: "Ask AI", desc: "Your CampusCoin assistant", icon: Bot, tone: "text-violet-300 bg-violet-500/10 border-violet-500/20" },
];

function QuickActions() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {ACTIONS.map((a, i) => (
        <motion.div
          key={a.href}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 + i * 0.05, ease }}
        >
          <Link
            href={a.href}
            className="surface-card group flex h-full flex-col items-center gap-2 rounded-2xl p-3 text-center transition-all hover:-translate-y-0.5 hover:border-line-strong sm:flex-row sm:items-center sm:gap-3 sm:p-4 sm:text-left"
          >
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl border", a.tone)}>
              <a.icon className="size-[18px]" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-fg">{a.label}</span>
              <span className="hidden truncate text-xs text-muted sm:block">{a.desc}</span>
            </span>
            <ArrowRight className="hidden size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg sm:block" />
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

/* ------------------------------ Issuer shortcut ------------------------------ */
function IssuerShortcut() {
  const { role } = useAuth();
  return (
    <Link
      href="/admin/issue"
      className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-violet-500/20 bg-violet-500/[0.05] p-5 transition-colors hover:border-violet-500/35"
    >
      <div aria-hidden className="pointer-events-none absolute -left-10 top-1/2 size-32 -translate-y-1/2 rounded-full bg-accent-gradient opacity-20 blur-2xl" />
      <div className="relative grid size-11 shrink-0 place-items-center rounded-xl border border-violet-500/25 bg-elevated">
        <Sparkles className="size-5 text-violet-300" />
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-fg">Issue rewards</span>
          <RoleBadge role={role} />
        </div>
        <p className="mt-0.5 text-xs text-muted">Mint CRP to students for achievements, with AI-suggested points.</p>
      </div>
      <ArrowRight className="relative size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
    </Link>
  );
}

/* ------------------------------ Recent activity ------------------------------ */
function RecentActivity() {
  const { data, loading, error, reload } = useApi<{ items: Activity[] }>("/api/activity?limit=8");
  const { address } = useWallet();
  const { profile } = useAuth();
  const me = address ?? profile?.wallet_address ?? null;
  return (
    <Card>
      <CardHeader
        title="Recent activity"
        description="Your latest on-chain events"
        icon={<ActivityIcon className="size-4" />}
        action={
          <ButtonLink href="/activity" variant="ghost" size="sm">
            View all <ArrowRight className="size-3.5" />
          </ButtonLink>
        }
      />
      <CardBody className="pt-3">
        {loading && !data ? (
          <ListSkeleton rows={5} />
        ) : error && !data ? (
          <ErrorState message={error} onRetry={reload} />
        ) : data && data.items.length > 0 ? (
          <ActivityList items={data.items} me={me} />
        ) : (
          <EmptyState
            icon={ActivityIcon}
            title="No activity yet"
            description="Rewards you earn, points you send and items you redeem will show up here."
            className="py-10"
          />
        )}
      </CardBody>
    </Card>
  );
}

/* ------------------------------ Page ------------------------------ */
export default function DashboardPage() {
  const { profile, session, isIssuer } = useAuth();
  const name = displayName(profile ?? { email: session?.user.email });
  const first = name.split(/\s+/)[0];

  return (
    <div>
      <PageHeader
        eyebrow="Dashboard"
        title={
          <>
            {greeting()}, <span className="text-gradient">{first}</span>
          </>
        }
        description="Your CampusCoin balance, rank and latest activity, straight from the blockchain."
      />

      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <BalanceHero />
          </div>
          <RankCard />
        </div>

        <QuickActions />

        {isIssuer && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2, ease }}>
            <IssuerShortcut />
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.24, ease }}>
          <OnboardingChecklist />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.28, ease }}>
          <RecentActivity />
        </motion.div>
      </div>
    </div>
  );
}
