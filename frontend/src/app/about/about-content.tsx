"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { isAddress } from "ethers";
import {
  ArrowRight, Blocks, Coins, Cpu, Database, Flame, Fuel, KeyRound, Monitor, Network, RefreshCw, Search, Send, Server, Wallet, Zap,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Aurora } from "@/components/landing";
import { useContractState } from "@/components/onchain-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressChip, Points, Skeleton } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { CONTRACT_ADDRESS, readCrpBalance } from "@/lib/chain";
import { isContractConfigured } from "@/lib/env";
import { errMsg } from "@/lib/api";
import { cn, fmt } from "@/lib/utils";

const FLOW = [
  { icon: Monitor, name: "Next.js DApp", role: "UI on Vercel; reads chain via public RPC" },
  { icon: Wallet, name: "MetaMask", role: "Holds keys, signs every transaction" },
  { icon: Cpu, name: "Sepolia EVM", role: "Runs CollegeRewardPoints, the source of truth" },
  { icon: Server, name: "FastAPI", role: "Verifies receipts, indexes events, AI" },
  { icon: Database, name: "Supabase", role: "Google login, profiles, catalog, index" },
];

const COMPONENTS = [
  { icon: KeyRound, name: "Account", body: "Each student, issuer and the college admin is an externally-owned account (EOA) in MetaMask. The contract itself is a contract account at its own address." },
  { icon: Send, name: "Transaction", body: "issueReward, transfer, redeem and addIssuer are signed transactions. Each one changes contract state and is permanently recorded with a hash you can look up on Etherscan." },
  { icon: Coins, name: "Ether", body: "Sepolia ETH only pays for gas. Reward points are CRP tokens, a separate ERC20 balance stored in the contract, not ETH." },
  { icon: Fuel, name: "Gas", body: "Every write costs gas (computation + storage). Batch issuance and decimals = 0 keep it cheap; reads like balanceOf are free." },
  { icon: Cpu, name: "EVM", body: "The Ethereum Virtual Machine executes the compiled Solidity bytecode deterministically on every node, enforcing the onlyIssuer and balance checks." },
  { icon: Network, name: "Node", body: "The app talks to Sepolia through an RPC node (PublicNode). Nodes validate blocks, keep state and serve eth_call / eth_getLogs to the frontend and backend." },
  { icon: Blocks, name: "Blockchain", body: "Blocks chain the transactions together immutably, so issuance history cannot be quietly edited, and anyone can audit totalIssued against the event log." },
];

const FUNCS = [
  { sig: "balanceOf(address)", kind: "view", body: "A student's point balance." },
  { sig: "totalSupply()", kind: "view", body: "All points currently in circulation." },
  { sig: "transfer(to, amount)", kind: "write", body: "Send points peer-to-peer; emits Transfer." },
  { sig: "approve / transferFrom", kind: "write", body: "Delegated spending (e.g. a canteen contract)." },
  { sig: "issueReward(to, amount, reason)", kind: "issuer", body: "Mint points with an on-chain reason; emits RewardIssued." },
  { sig: "batchIssueReward(...)", kind: "issuer", body: "Reward up to 50 students in one transaction." },
  { sig: "redeem(amount, itemId)", kind: "write", body: "Burn points for a store item; emits Redeemed." },
  { sig: "addIssuer / pause / setMaxIssuePerTx", kind: "owner", body: "Access control and circuit breaker." },
];

const KIND_TONE = { view: "info", write: "accent", issuer: "success", owner: "gold" } as const;

function Section({ eyebrow, title, children, className }: { eyebrow: string; title: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("mx-auto max-w-6xl px-4 py-16 sm:px-6", className)}>
      <div className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">{eyebrow}</div>
      <h2 className="mt-3 max-w-2xl text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{title}</h2>
      <div className="mt-10">{children}</div>
    </section>
  );
}

function LivePanel() {
  const { state, loading, error, reload } = useContractState();
  const rows: [string, React.ReactNode][] = state
    ? [
        ["name()", state.name],
        ["symbol()", state.symbol],
        ["decimals()", String(state.decimals)],
        ["totalSupply()", <Points key="ts" value={Number(state.totalSupply)} />],
        ["totalIssued()", <Points key="ti" value={Number(state.totalIssued)} />],
        ["totalRedeemed()", <Points key="tr" value={Number(state.totalRedeemed)} />],
        ["maxIssuePerTx()", fmt(state.maxIssuePerTx)],
        ["paused()", state.paused ? <Badge key="p" tone="warning" dot>true</Badge> : <Badge key="p" tone="success" dot>false</Badge>],
        ["owner()", <AddressChip key="o" address={state.owner} link />],
      ]
    : [];
  return (
    <div className="surface-card rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            Live contract read
          </p>
          <p className="mt-0.5 text-xs text-muted">eth_call against Sepolia, no wallet needed</p>
        </div>
        <Button size="icon" variant="ghost" aria-label="Refresh" onClick={reload}>
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        </Button>
      </div>
      <div className="mt-4 divide-y divide-line/60 font-mono text-[13px]">
        {!isContractConfigured ? (
          <p className="py-3 text-muted">Contract address not configured.</p>
        ) : error && !state ? (
          <p className="py-3 text-red-300">{error}</p>
        ) : !state ? (
          Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="my-2.5 h-5 w-full" />)
        ) : (
          rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 py-2.5">
              <span className="text-accent-2">{k}</span>
              <span className="min-w-0 truncate text-right text-fg">{v}</span>
            </div>
          ))
        )}
      </div>
      {isContractConfigured && (
        <div className="mt-4 border-t border-line pt-4">
          <AddressChip address={CONTRACT_ADDRESS} link />
        </div>
      )}
    </div>
  );
}

function BalanceChecker() {
  const [addr, setAddr] = useState("");
  const [result, setResult] = useState<{ addr: string; bal: bigint | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = isAddress(addr.trim());
  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setErr(null);
    try {
      setResult({ addr: addr.trim(), bal: await readCrpBalance(addr.trim()) });
    } catch (x) {
      setErr(errMsg(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="surface-card rounded-2xl p-5">
      <p className="text-sm font-medium">Check any balance</p>
      <p className="mt-0.5 text-xs text-muted">Calls balanceOf(address) directly on-chain</p>
      <form onSubmit={check} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input placeholder="0x…" value={addr} onChange={(e) => setAddr(e.target.value)} className="font-mono" aria-label="Wallet address" />
        <Button type="submit" loading={busy} disabled={!valid || !isContractConfigured}>
          <Search className="size-4" aria-hidden />
          Check
        </Button>
      </form>
      {addr && !valid && <p className="mt-2 text-xs text-red-300">Enter a valid 0x address</p>}
      {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
      {result && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex items-center justify-between rounded-xl border border-line bg-black/20 px-4 py-3">
          <AddressChip address={result.addr} link />
          <Points value={Number(result.bal ?? 0n)} className="text-lg font-semibold" />
        </motion.div>
      )}
    </div>
  );
}

export function AboutContent() {
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <SiteHeader />
      <main>
        <div className="relative">
          <Aurora />
          <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-20 sm:px-6 sm:pt-28">
            <Badge tone="accent">How it works</Badge>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              A reward ledger nobody can quietly edit.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
              CampusCoin issues College Reward Points (CRP) as an ERC20 token on Ethereum&apos;s Sepolia testnet. The college mints points for
              achievements, students hold and transfer them from their own wallets, and redemptions burn them, all verifiable on-chain.
            </p>
          </div>
        </div>

        <Section eyebrow="Architecture" title={<>Five layers. <span className="text-muted">One source of truth.</span></>}>
          <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center">
            {FLOW.map((n, i) => (
              <div key={n.name} className="flex flex-col items-center gap-2 lg:flex-1 lg:flex-row">
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                  className="surface-card w-full rounded-2xl p-4"
                >
                  <n.icon className="size-5 text-accent-2" />
                  <p className="mt-3 text-sm font-semibold">{n.name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{n.role}</p>
                </motion.div>
                {i < FLOW.length - 1 && <ArrowRight className="size-4 shrink-0 rotate-90 text-subtle lg:rotate-0" aria-hidden />}
              </div>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted">
            Balances and permissions live only in the smart contract. The backend never holds the admin key; it reads transaction receipts and
            event logs to build a fast, searchable index (activity feed, leaderboard, vouchers). If the database disappeared, it could be fully
            rebuilt from the chain.
          </p>
        </Section>

        <Section eyebrow="Ethereum components" title="How each building block maps to this app">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {COMPONENTS.map((c, i) => (
              <motion.div
                key={c.name}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: (i % 3) * 0.05 }}
                className="surface-card rounded-2xl p-5 transition-transform duration-300 hover:-translate-y-0.5"
              >
                <div className="grid size-9 place-items-center rounded-xl border border-violet-500/20 bg-violet-500/10">
                  <c.icon className="size-4 text-violet-300" />
                </div>
                <h3 className="mt-4 font-semibold tracking-tight">{c.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{c.body}</p>
              </motion.div>
            ))}
          </div>
        </Section>

        <Section eyebrow="Smart contract" title={<>CollegeRewardPoints.sol <span className="text-muted">· ERC20 + roles</span></>}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="surface-card overflow-hidden rounded-2xl">
              <ul className="divide-y divide-line/60">
                {FUNCS.map((f) => (
                  <li key={f.sig} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:gap-4">
                    <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-accent-2">{f.sig}</code>
                    <span className="text-sm text-muted sm:w-64">{f.body}</span>
                    <Badge tone={KIND_TONE[f.kind as keyof typeof KIND_TONE]} className="w-fit">{f.kind}</Badge>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-4">
              <LivePanel />
              <BalanceChecker />
            </div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              { icon: Zap, t: "decimals = 0", b: "Points are whole numbers, so 1 CRP is exactly 1 point everywhere, MetaMask included." },
              { icon: KeyRound, t: "onlyIssuer + cap", b: "Only authorised issuers can mint, and at most maxIssuePerTx per recipient limits damage from a leaked key." },
              { icon: Flame, t: "Burn on redeem", b: "redeem() destroys points, so supply always equals issued minus redeemed, and anyone can audit it." },
            ].map((x) => (
              <div key={x.t} className="rounded-2xl border border-line bg-white/[0.02] p-5">
                <x.icon className="size-4 text-amber-300" />
                <p className="mt-3 font-mono text-sm">{x.t}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{x.b}</p>
              </div>
            ))}
          </div>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
