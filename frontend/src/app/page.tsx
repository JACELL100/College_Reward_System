import Link from "next/link";
import { ArrowRight, Boxes, Coins, Cpu, Database, Flame, Globe, Send, Server, Sparkles, Wallet } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ContractStrip, Hero, LiveStats, RecentTicker } from "@/components/landing";

const STEPS = [
  {
    icon: Sparkles,
    title: "Issue",
    body: "Faculty issuers call issueReward() from MetaMask. The contract mints CRP straight to a student's wallet with a reason.",
    fn: "issueReward(to, amount, reason)",
    tint: "text-violet-300 bg-violet-500/10 border-violet-500/20",
  },
  {
    icon: Wallet,
    title: "Hold",
    body: "Balances live in the ERC20 contract on Sepolia. No database can edit them, and anyone can verify them on Etherscan.",
    fn: "balanceOf(account)",
    tint: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
  },
  {
    icon: Send,
    title: "Transfer",
    body: "Send points to classmates with a standard ERC20 transfer, signed in MetaMask and paid for with a little test ETH gas.",
    fn: "transfer(to, amount)",
    tint: "text-cyan-300 bg-cyan-500/10 border-cyan-500/20",
  },
  {
    icon: Flame,
    title: "Redeem",
    body: "Spend points at the reward store. redeem() burns the tokens and emits an event that becomes a voucher code.",
    fn: "redeem(amount, itemId)",
    tint: "text-amber-300 bg-amber-500/10 border-amber-500/20",
  },
];

const STACK = [
  { icon: Globe, name: "Next.js", role: "DApp UI on Vercel" },
  { icon: Wallet, name: "MetaMask", role: "Keys & signing" },
  { icon: Cpu, name: "Sepolia EVM", role: "ERC20 contract" },
  { icon: Server, name: "FastAPI", role: "Indexer & AI" },
  { icon: Database, name: "Supabase", role: "Auth & profiles" },
];

export default function Home() {
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <SiteHeader />
      <main>
        <Hero />
        <LiveStats />

        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
          <div className="max-w-2xl">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">How it works</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
              Four contract calls. <span className="text-muted">Zero trust required.</span>
            </h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <div
                key={s.title}
                className="surface-card group relative rounded-2xl p-6 transition-transform duration-300 hover:-translate-y-1"
              >
                <div className="flex items-center justify-between">
                  <div className={`grid size-10 place-items-center rounded-xl border ${s.tint}`}>
                    <s.icon className="size-5" />
                  </div>
                  <span className="font-mono text-xs text-subtle">0{i + 1}</span>
                </div>
                <h3 className="mt-6 text-lg font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
                <code className="mt-5 block truncate rounded-lg border border-line bg-black/30 px-2.5 py-1.5 font-mono text-[11px] text-accent-2">
                  {s.fn}
                </code>
              </div>
            ))}
          </div>
        </section>

        <section id="stack" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-24 sm:px-6">
          <div className="surface-card overflow-hidden rounded-3xl p-6 sm:p-10">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">Architecture</div>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">A real DApp, end to end.</h2>
              </div>
              <p className="max-w-md text-sm text-muted">
                The browser talks to the chain directly through MetaMask (ethers.js). The backend only indexes events,
                stores profiles and powers the AI assistant. It can never move your tokens.
              </p>
            </div>
            <div className="mt-10 flex flex-col items-stretch gap-3 md:flex-row md:items-center">
              {STACK.map((s, i) => (
                <div key={s.name} className="flex flex-1 flex-col items-center gap-3 md:flex-row">
                  <div className="flex w-full items-center gap-3 rounded-2xl border border-line bg-black/30 px-4 py-3.5 md:flex-col md:items-start">
                    <div className="grid size-9 place-items-center rounded-xl border border-line bg-elevated">
                      <s.icon className="size-4 text-accent" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{s.name}</div>
                      <div className="text-[11px] text-subtle">{s.role}</div>
                    </div>
                  </div>
                  {i < STACK.length - 1 && (
                    <ArrowRight className="size-4 shrink-0 rotate-90 text-subtle md:rotate-0" aria-hidden />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">Live ledger</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Recent on-chain activity</h2>
            </div>
            <span className="hidden items-center gap-2 text-xs text-muted sm:inline-flex">
              <Boxes className="size-3.5" /> Every row is a Sepolia transaction
            </span>
          </div>
          <RecentTicker />
          <div className="mt-8">
            <ContractStrip />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-[#16122c] via-surface to-[#0b1820] px-6 py-14 text-center sm:px-12">
            <div className="absolute -left-20 -top-20 size-72 rounded-full bg-violet-600/25 blur-3xl" aria-hidden />
            <div className="absolute -bottom-24 -right-10 size-72 rounded-full bg-cyan-500/15 blur-3xl" aria-hidden />
            <Coins className="relative mx-auto size-8 text-gold" />
            <h2 className="relative mt-5 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
              Your achievements, minted.
            </h2>
            <p className="relative mx-auto mt-3 max-w-md text-sm text-muted">
              Create an account in seconds, connect MetaMask and claim your first points.
            </p>
            <Link
              href="/login?mode=signup"
              className="relative mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-accent-gradient px-6 text-[15px] font-medium text-white shadow-[0_8px_24px_-8px_rgb(124_92_246/0.6)] transition hover:brightness-110"
            >
              Get started <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
