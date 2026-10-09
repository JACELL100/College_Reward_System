"use client";
import { motion } from "motion/react";
import { ArrowDownLeft, ArrowUpRight, Flame, Sparkles } from "lucide-react";
import type { Activity } from "@/lib/types";
import { cn, fmt, shortAddr, timeAgo } from "@/lib/utils";
import { TxLink } from "@/components/ui/misc";

const ZERO = "0x0000000000000000000000000000000000000000";

function who(p: { full_name: string | null } | null, addr: string | null) {
  if (p?.full_name) return p.full_name;
  if (!addr || addr === ZERO) return "CampusCoin";
  return shortAddr(addr);
}

export function ActivityRow({ a, me, index = 0 }: { a: Activity; me?: string | null; index?: number }) {
  const meL = me?.toLowerCase();
  const incoming = a.type === "issue" || (a.type === "transfer" && a.to_address?.toLowerCase() === meL);
  const outgoing = a.type === "redeem" || (a.type === "transfer" && a.from_address?.toLowerCase() === meL);
  const meta =
    a.type === "issue"
      ? { Icon: Sparkles, ring: "text-violet-300 bg-violet-500/10 border-violet-500/20", label: "Reward issued" }
      : a.type === "redeem"
        ? { Icon: Flame, ring: "text-amber-300 bg-amber-500/10 border-amber-500/20", label: "Redeemed" }
        : incoming && meL
          ? { Icon: ArrowDownLeft, ring: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20", label: "Received" }
          : { Icon: ArrowUpRight, ring: "text-cyan-300 bg-cyan-500/10 border-cyan-500/20", label: "Transfer" };

  let title: string;
  if (a.type === "issue") title = `${who(a.to_profile, a.to_address)} earned`;
  else if (a.type === "redeem") title = `${who(a.from_profile, a.from_address)} redeemed`;
  else title = `${who(a.from_profile, a.from_address)} → ${who(a.to_profile, a.to_address)}`;

  const detail = [a.category?.name, a.reason, a.note].filter(Boolean).join(" · ");
  const sign = meL ? (a.type === "issue" && a.to_address?.toLowerCase() === meL) || (incoming && a.type === "transfer") ? "+" : outgoing ? "−" : "" : "";

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.3 }}
      className="group flex items-start gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-white/[0.025] sm:px-3"
    >
      <div className={cn("grid size-9 shrink-0 place-items-center rounded-xl border", meta.ring)}>
        <meta.Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{title}</p>
            <p className="mt-0.5 truncate text-xs text-muted">{detail || meta.label}</p>
          </div>
          <div
            className={cn(
              "shrink-0 font-mono text-sm font-medium tabular",
              sign === "+" ? "text-emerald-300" : sign === "−" ? "text-fg" : "text-fg",
            )}
          >
            {sign}
            {fmt(a.amount)} <span className="text-[11px] text-subtle">CRP</span>
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-subtle">
          <span>{timeAgo(a.block_time) || `Block #${a.block_number}`}</span>
          <TxLink hash={a.tx_hash} className="text-[11px]" />
        </div>
      </div>
    </motion.li>
  );
}

export function ActivityList({ items, me }: { items: Activity[]; me?: string | null }) {
  return (
    <ul className="divide-y divide-line/60">
      {items.map((a, i) => (
        <ActivityRow key={`${a.tx_hash}-${a.log_index}`} a={a} me={me} index={i} />
      ))}
    </ul>
  );
}
