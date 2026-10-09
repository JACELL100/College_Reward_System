"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, ArrowUpRight, ExternalLink, Flame, Sparkles } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { ButtonLink } from "@/components/ui/button";
import { CopyButton, CountUp, Skeleton } from "@/components/ui/misc";
import { CoinMark } from "@/components/logo";
import { api } from "@/lib/api";
import { CONTRACT_ADDRESS, explorerAddr, explorerTx, readContract, readContractState } from "@/lib/chain";
import { isContractConfigured } from "@/lib/env";
import type { Activity, PublicStats } from "@/lib/types";
import { cn, fmt, shortAddr, timeAgo } from "@/lib/utils";

const ease = [0.16, 1, 0.3, 1] as const;

export function Aurora() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black_30%,transparent_80%)]" />
      <div className="absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 animate-aurora rounded-full bg-[conic-gradient(from_180deg_at_50%_50%,#6366f1_0deg,#8b5cf6_120deg,#22d3ee_240deg,#6366f1_360deg)] opacity-[0.22] blur-[110px]" />
      <div className="absolute right-[-10%] top-40 h-[320px] w-[420px] animate-aurora rounded-full bg-cyan-500/20 blur-[120px] [animation-delay:-6s]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-bg" />
    </div>
  );
}

export function Hero() {
  const { session, ready } = useAuth();
  return (
    <section className="relative">
      <Aurora />
      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-20 text-center sm:px-6 sm:pb-24 sm:pt-28">
        <motion.a
          href="/about"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
          className="mx-auto inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.03] py-1 pl-1 pr-3 text-xs text-muted backdrop-blur hover:border-line-strong hover:text-fg"
        >
          <span className="rounded-full bg-accent-gradient px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
            Live
          </span>
          ERC20 on Ethereum Sepolia · FRCRCE
          <ArrowRight className="size-3" />
        </motion.a>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05, ease }}
          className="mx-auto mt-7 max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.045em] sm:text-6xl md:text-7xl"
        >
          Reward points students <span className="text-gradient">actually own.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.12, ease }}
          className="mx-auto mt-6 max-w-xl text-balance text-base text-muted sm:text-lg"
        >
          CampusCoin issues College Reward Points as an ERC20 token. Earn for hackathons, papers and volunteering,
          send to friends, and redeem at the campus store, all verifiable on-chain.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease }}
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          {ready && session ? (
            <ButtonLink href="/dashboard" size="lg">
              Open dashboard <ArrowRight className="size-4" />
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login?mode=signup" size="lg">
                Get started <ArrowRight className="size-4" />
              </ButtonLink>
              <ButtonLink href="/login" size="lg" variant="secondary">
                Sign in
              </ButtonLink>
            </>
          )}
          <ButtonLink href="/about" size="lg" variant="outline">
            How it works
          </ButtonLink>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 30, rotateX: 18 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 1, delay: 0.3, ease }}
          className="mx-auto mt-16 max-w-md [perspective:1000px]"
        >
          <PreviewCard />
        </motion.div>
      </div>
    </section>
  );
}

function PreviewCard() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[2rem] bg-accent-gradient opacity-20 blur-3xl" />
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#191433] via-[#0f1222] to-[#0a1a24] p-6 text-left shadow-2xl">
        <div className="absolute -right-16 -top-16 size-48 rounded-full bg-violet-500/30 blur-3xl" />
        <div className="relative flex items-center justify-between">
          <span className="text-xs font-medium text-white/60">CRP balance</span>
          <CoinMark size={28} />
        </div>
        <div className="relative mt-4 font-mono text-5xl font-semibold tracking-tight tabular text-white">
          <CountUp value={1250} duration={2} />
        </div>
        <div className="relative mt-6 flex items-center justify-between text-xs text-white/50">
          <span className="font-mono">0x7a3c…9f12</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-400" /> Sepolia
          </span>
        </div>
      </div>
    </div>
  );
}

interface StatsView {
  total_supply: number;
  total_issued: number;
  total_redeemed: number;
  holders: number | null;
  transactions: number | null;
}

export function LiveStats() {
  const [stats, setStats] = useState<StatsView | null>(null);
  const [source, setSource] = useState<"api" | "chain" | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let gotApi = false;
    // Fast path: read on-chain immediately (works even while the backend cold-starts)
    readContractState()
      .then((s) => {
        if (!alive || !s || gotApi) return;
        setStats({
          total_supply: Number(s.totalSupply),
          total_issued: Number(s.totalIssued),
          total_redeemed: Number(s.totalRedeemed),
          holders: null,
          transactions: null,
        });
        setSource("chain");
      })
      .catch(() => {});
    api
      .get<PublicStats>("/api/public/stats", { auth: false, retries: 3 })
      .then((s) => {
        if (!alive) return;
        gotApi = true;
        setStats({
          total_supply: s.total_supply,
          total_issued: s.total_issued,
          total_redeemed: s.total_redeemed,
          holders: s.holders,
          transactions: s.transactions,
        });
        setSource("api");
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const items: { label: string; value: number | null | undefined }[] = [
    { label: "Total supply", value: stats?.total_supply },
    { label: "Points issued", value: stats?.total_issued },
    { label: "Points redeemed", value: stats?.total_redeemed },
    { label: "Holders", value: stats?.holders },
    { label: "Transactions", value: stats?.transactions },
  ];
  const loading = !stats && !(failed && !isContractConfigured);

  return (
    <section className="relative mx-auto max-w-6xl px-4 sm:px-6">
      <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-surface/70 backdrop-blur sm:grid-cols-3 lg:grid-cols-5">
        {items.map((it, i) => (
          <div
            key={it.label}
            className={cn(
              "border-line p-5 sm:p-6",
              i > 0 && "border-l",
              i === 2 && "max-sm:border-l-0",
              i >= 2 && "max-sm:border-t",
              i === 4 && "max-lg:col-span-2 max-lg:border-t sm:max-lg:col-span-2",
            )}
          >
            <div className="text-xs text-muted">{it.label}</div>
            <div className="mt-2 font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
              {loading ? (
                <Skeleton className="h-8 w-20" />
              ) : typeof it.value === "number" ? (
                <CountUp value={it.value} />
              ) : (
                <span className="text-subtle">—</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[11px] text-subtle">
        {source === "api"
          ? "Live from the CampusCoin indexer"
          : source === "chain"
            ? "Read directly from the smart contract (indexer warming up)"
            : failed && !isContractConfigured
              ? "Stats unavailable: contract not configured"
              : "Fetching live stats…"}
      </p>
    </section>
  );
}

export function RecentTicker() {
  const [items, setItems] = useState<Activity[] | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .get<Activity[]>("/api/public/recent", { auth: false, retries: 3 })
      .then((r) => alive && setItems(Array.isArray(r) ? r : []))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, []);

  if (items === null)
    return (
      <div className="flex gap-3 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-64 shrink-0 rounded-2xl" />
        ))}
      </div>
    );
  if (!items.length)
    return (
      <div className="rounded-2xl border border-dashed border-line px-6 py-8 text-center text-sm text-muted">
        No on-chain activity yet. The first reward will show up here.
      </div>
    );
  const loop = items.length >= 4 ? [...items, ...items] : items;
  return (
    <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
      <div className={cn("flex w-max gap-3", items.length >= 4 && "animate-marquee hover:[animation-play-state:paused]")}>
        {loop.map((a, i) => {
          const name =
            a.type === "redeem"
              ? a.from_profile?.full_name || shortAddr(a.from_address)
              : a.to_profile?.full_name || shortAddr(a.to_address);
          const Icon = a.type === "issue" ? Sparkles : a.type === "redeem" ? Flame : ArrowUpRight;
          const verb = a.type === "issue" ? "earned" : a.type === "redeem" ? "redeemed" : "received";
          return (
            <a
              key={`${a.tx_hash}-${a.log_index}-${i}`}
              href={explorerTx(a.tx_hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-72 shrink-0 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition-colors hover:border-line-strong"
            >
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-xl border",
                  a.type === "issue"
                    ? "border-violet-500/20 bg-violet-500/10 text-violet-300"
                    : a.type === "redeem"
                      ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                      : "border-cyan-500/20 bg-cyan-500/10 text-cyan-300",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  <span className="font-medium text-fg">{name}</span> <span className="text-muted">{verb}</span>{" "}
                  <span className="font-mono text-gold">{fmt(a.amount)}</span>
                </span>
                <span className="block truncate text-[11px] text-subtle">
                  {a.reason || a.category?.name || "On-chain transfer"} · {timeAgo(a.block_time)}
                </span>
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

export function ContractStrip() {
  const [holder, setHolder] = useState<string | null>(null);
  useEffect(() => {
    const c = readContract();
    if (!c) return;
    c.symbol()
      .then((s: string) => setHolder(s))
      .catch(() => {});
  }, []);
  if (!isContractConfigured)
    return (
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] px-5 py-4 text-sm text-amber-100">
        Contract not configured yet.
      </div>
    );
  return (
    <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <CoinMark size={36} />
        <div className="min-w-0">
          <div className="text-sm font-medium">
            College Reward Points {holder && <span className="font-mono text-muted">({holder})</span>}
          </div>
          <div className="mt-0.5 flex items-center gap-1 font-mono text-xs text-muted">
            <span className="truncate">
              <span className="sm:hidden">{shortAddr(CONTRACT_ADDRESS, 8)}</span>
              <span className="hidden sm:inline">{CONTRACT_ADDRESS}</span>
            </span>
            <CopyButton text={CONTRACT_ADDRESS} label="Copy contract address" />
          </div>
        </div>
      </div>
      <a
        href={explorerAddr(CONTRACT_ADDRESS)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs text-muted hover:bg-white/[0.04] hover:text-fg"
      >
        View on Etherscan <ExternalLink className="size-3" />
      </a>
    </div>
  );
}
