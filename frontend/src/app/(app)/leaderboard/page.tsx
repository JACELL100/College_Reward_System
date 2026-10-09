"use client";
import { motion } from "motion/react";
import { Crown, Medal, RefreshCw, Sparkles, Trophy } from "lucide-react";
import { displayName, useAuth } from "@/components/providers/auth-provider";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, CountUp, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/misc";
import { useApi } from "@/lib/use-api";
import type { Leaderboard, LeaderboardEntry } from "@/lib/types";
import { cn, fmt } from "@/lib/utils";

const ease = [0.16, 1, 0.3, 1] as const;

const PODIUM = {
  1: {
    label: "Gold",
    ring: "ring-yellow-400/60",
    glow: "bg-gold-gradient",
    text: "text-yellow-200",
    chip: "bg-gold-gradient text-black",
    block: "h-28 sm:h-36 border-yellow-500/25 bg-gradient-to-b from-yellow-500/[0.14] to-yellow-500/[0.02]",
    avatar: 72,
  },
  2: {
    label: "Silver",
    ring: "ring-slate-300/50",
    glow: "bg-slate-300",
    text: "text-slate-200",
    chip: "bg-gradient-to-b from-slate-100 to-slate-400 text-black",
    block: "h-20 sm:h-28 border-slate-300/20 bg-gradient-to-b from-slate-300/[0.10] to-slate-300/[0.02]",
    avatar: 56,
  },
  3: {
    label: "Bronze",
    ring: "ring-orange-400/50",
    glow: "bg-orange-500",
    text: "text-orange-200",
    chip: "bg-gradient-to-b from-orange-300 to-orange-600 text-black",
    block: "h-14 sm:h-20 border-orange-500/20 bg-gradient-to-b from-orange-500/[0.12] to-orange-500/[0.02]",
    avatar: 56,
  },
} as const;

function PodiumSpot({ e, place, isMe, index }: { e: LeaderboardEntry | undefined; place: 1 | 2 | 3; isMe: boolean; index: number }) {
  const s = PODIUM[place];
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.08 + index * 0.08, ease }}
      className="flex min-w-0 flex-1 flex-col items-center"
    >
      {e ? (
        <>
          <div className="relative mb-3">
            {place === 1 && (
              <Crown className="absolute -top-6 left-1/2 size-5 -translate-x-1/2 text-gold drop-shadow-[0_0_8px_rgb(245_196_81/0.6)]" aria-hidden />
            )}
            <div aria-hidden className={cn("absolute inset-0 rounded-full opacity-30 blur-xl", s.glow)} />
            <Avatar
              src={e.avatar_url}
              name={e.full_name}
              seed={e.wallet_address ?? e.profile_id}
              size={s.avatar}
              className={cn("relative ring-2 ring-offset-2 ring-offset-bg", s.ring)}
            />
            <span
              className={cn(
                "absolute -bottom-1.5 left-1/2 grid size-6 -translate-x-1/2 place-items-center rounded-full font-mono text-[11px] font-bold shadow-lg",
                s.chip,
              )}
            >
              {place}
            </span>
          </div>
          <div className="flex w-full min-w-0 items-center justify-center gap-1">
            <span className="truncate text-center text-xs font-medium text-fg sm:text-sm">{e.full_name ?? "Student"}</span>
            {isMe && <Badge tone="accent" className="hidden px-1.5 sm:inline-flex">You</Badge>}
          </div>
          <div className="mt-0.5 w-full truncate text-center text-[11px] text-subtle">{e.department ?? " "}</div>
          <div className={cn("mt-1.5 font-mono text-sm font-semibold tabular sm:text-base", s.text)}>
            {fmt(e.balance)} <span className="text-[10px] font-normal text-subtle">CRP</span>
          </div>
        </>
      ) : (
        <div className="mb-3 flex flex-col items-center">
          <div
            className="grid place-items-center rounded-full border border-dashed border-line-strong text-subtle"
            style={{ width: s.avatar, height: s.avatar }}
          >
            <Medal className="size-5" />
          </div>
          <div className="mt-3 text-xs text-subtle">Open spot</div>
        </div>
      )}
      <div
        className={cn(
          "mt-3 flex w-full items-start justify-center rounded-t-xl border border-b-0 pt-2 font-mono text-xs font-medium",
          s.block,
          s.text,
        )}
      >
        {s.label}
      </div>
    </motion.div>
  );
}

function Podium({ items, myId }: { items: LeaderboardEntry[]; myId: string | null }) {
  const [a, b, c] = items;
  return (
    <Card className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold-gradient opacity-[0.08] blur-3xl" />
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-yellow-200/25 to-transparent" />
      <div className="relative flex items-end gap-2 px-3 pt-10 sm:gap-4 sm:px-8">
        <PodiumSpot e={b} place={2} isMe={!!b && b.profile_id === myId} index={1} />
        <PodiumSpot e={a} place={1} isMe={!!a && a.profile_id === myId} index={0} />
        <PodiumSpot e={c} place={3} isMe={!!c && c.profile_id === myId} index={2} />
      </div>
    </Card>
  );
}

function RankRow({ e, isMe, index }: { e: LeaderboardEntry; isMe: boolean; index: number }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.4), duration: 0.3 }}
      className={cn(
        "relative flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors sm:px-3",
        isMe ? "bg-violet-500/[0.08] ring-1 ring-inset ring-violet-500/30" : "hover:bg-white/[0.025]",
      )}
    >
      {isMe && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent-gradient" />}
      <span className="w-7 shrink-0 text-center font-mono text-xs font-medium tabular text-subtle sm:w-8 sm:text-sm">{e.rank}</span>
      <Avatar src={e.avatar_url} name={e.full_name} seed={e.wallet_address ?? e.profile_id} size={34} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-fg">{e.full_name ?? "Student"}</span>
          {isMe && <Badge tone="accent">You</Badge>}
        </div>
        <div className="truncate text-xs text-subtle">{e.department ?? "No department"}</div>
      </div>
      <div className="hidden w-24 shrink-0 text-right sm:block">
        <div className="font-mono text-xs tabular text-muted">{fmt(e.earned)}</div>
        <div className="text-[10px] text-subtle">earned</div>
      </div>
      <div className="w-20 shrink-0 text-right sm:w-24">
        <div className="font-mono text-sm font-medium tabular text-fg">{fmt(e.balance)}</div>
        <div className="text-[10px] text-subtle">CRP</div>
      </div>
    </motion.li>
  );
}

function YourRank({ me, loading, total }: { me: Leaderboard["me"]; loading: boolean; total: number }) {
  const { profile, session } = useAuth();
  const name = displayName(profile ?? { email: session?.user.email });
  return (
    <Card className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-44 rounded-full bg-accent-gradient opacity-20 blur-3xl" />
      <CardBody className="relative">
        <div className="flex items-center gap-3">
          <Avatar src={profile?.avatar_url} name={name} seed={profile?.wallet_address ?? profile?.id} size={40} />
          <div className="min-w-0">
            <div className="text-xs text-muted">Your rank</div>
            <div className="truncate text-sm font-medium text-fg">{name}</div>
          </div>
        </div>
        {loading ? (
          <div className="mt-5 space-y-3">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-4 w-full" />
          </div>
        ) : me ? (
          <>
            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-xl text-subtle">#</span>
              <span className="font-mono text-5xl font-semibold tracking-tight text-fg">
                <CountUp value={me.rank} duration={0.8} />
              </span>
              {me.rank <= 3 && <Trophy className="ml-2 size-5 text-gold" aria-hidden />}
            </div>
            <p className="mt-1 text-xs text-muted">
              {me.rank === 1
                ? "You're leading the campus."
                : me.rank <= total
                  ? `You're on the board, top ${fmt(total)} shown.`
                  : "Keep earning to break into the top list."}
            </p>
            <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4">
              <div>
                <dt className="text-[11px] text-subtle">Balance</dt>
                <dd className="mt-0.5 font-mono text-sm tabular text-fg">{fmt(me.balance)} CRP</dd>
              </div>
              <div>
                <dt className="text-[11px] text-subtle">Total earned</dt>
                <dd className="mt-0.5 font-mono text-sm tabular text-fg">{fmt(me.earned)} CRP</dd>
              </div>
            </dl>
          </>
        ) : (
          <div className="mt-5">
            <p className="text-sm text-muted">You&apos;re not ranked yet.</p>
            <p className="mt-1 text-xs text-subtle">Link your wallet and earn rewards to appear on the board.</p>
            <ButtonLink href="/dashboard" variant="secondary" size="sm" className="mt-4">
              <Sparkles className="size-3.5" /> Get set up
            </ButtonLink>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function BoardSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-end justify-center gap-4 px-6 pt-10">
          {[56, 72, 56].map((s, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-3">
              <div style={{ width: s, height: s }} className="relative">
                <Skeleton className="absolute inset-0 rounded-full" />
              </div>
              <Skeleton className="h-3 w-16" />
              <Skeleton className={cn("w-full rounded-b-none rounded-t-xl", i === 1 ? "h-32" : i === 0 ? "h-24" : "h-16")} />
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <CardBody className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-6" />
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-2/5" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

export default function LeaderboardPage() {
  const { profile } = useAuth();
  const { data, loading, error, reload } = useApi<Leaderboard>("/api/leaderboard?limit=25");
  const items = data?.items ?? [];
  const myId = profile?.id ?? null;
  const rest = items.slice(3);

  return (
    <div>
      <PageHeader
        eyebrow="Leaderboard"
        title="Top earners on campus"
        description="Ranked by current CRP balance, computed from indexed on-chain events."
        actions={
          <Button variant="secondary" onClick={reload} disabled={loading} aria-label="Refresh leaderboard">
            <RefreshCw className={cn("size-4", loading && "animate-spin")} /> Refresh
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <aside className="lg:order-2">
          <div className="lg:sticky lg:top-20">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }}>
              <YourRank me={data?.me ?? null} loading={loading && !data} total={items.length} />
            </motion.div>
          </div>
        </aside>

        <div className="min-w-0 lg:order-1">
          {error && !data ? (
            <ErrorState message={error} onRetry={reload} />
          ) : loading && !data ? (
            <BoardSkeleton />
          ) : items.length === 0 ? (
            <Card>
              <EmptyState
                icon={Trophy}
                title="No one on the board yet"
                description="Once rewards are issued on-chain, the top earners will appear here."
              />
            </Card>
          ) : (
            <div className="space-y-6">
              <Podium items={items} myId={myId} />
              {rest.length > 0 && (
                <Card>
                  <CardHeader
                    title="Rankings"
                    description={`Showing top ${fmt(items.length)}`}
                    icon={<Medal className="size-4" />}
                  />
                  <CardBody className="px-2 pt-3 sm:px-3">
                    <div className="mb-1 flex items-center gap-3 px-2 text-[10px] font-medium uppercase tracking-[0.12em] text-subtle sm:px-3">
                      <span className="w-7 text-center sm:w-8">#</span>
                      <span className="flex-1 pl-[46px]">Student</span>
                      <span className="hidden w-24 text-right sm:block">Earned</span>
                      <span className="w-20 text-right sm:w-24">Balance</span>
                    </div>
                    <ul className="space-y-0.5">
                      {rest.map((e, i) => (
                        <RankRow key={e.profile_id} e={e} isMe={e.profile_id === myId} index={i} />
                      ))}
                    </ul>
                  </CardBody>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
