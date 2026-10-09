"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowDownToLine, ArrowLeftRight, Gift, History, Layers, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { ActivityList } from "@/components/activity-list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/ui/misc";
import { api, errMsg } from "@/lib/api";
import type { Activity, ActivityType } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = "all" | ActivityType;
type Scope = "me" | "all";
const PAGE = 50;

const FILTERS: { value: Filter; label: string; icon: typeof Layers }[] = [
  { value: "all", label: "All", icon: Layers },
  { value: "issue", label: "Issued", icon: ArrowDownToLine },
  { value: "transfer", label: "Transfers", icon: ArrowLeftRight },
  { value: "redeem", label: "Redeemed", icon: Gift },
];

function dayLabel(iso: string | null) {
  if (!iso) return "Pending timestamp";
  const d = new Date(iso);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export default function ActivityPage() {
  const { profile, isIssuer, isAdmin } = useAuth();
  const staff = isIssuer || isAdmin;
  const [filter, setFilter] = useState<Filter>("all");
  const [scope, setScope] = useState<Scope>("me");
  const [items, setItems] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [tick, setTick] = useState(0);

  const query = useCallback(
    (before?: number) => {
      const p = new URLSearchParams({ limit: String(PAGE), scope: staff ? scope : "me" });
      if (filter !== "all") p.set("type", filter);
      if (before !== undefined) p.set("before_block", String(before));
      return `/api/activity?${p.toString()}`;
    },
    [filter, scope, staff],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<{ items: Activity[] }>(query())
      .then((r) => {
        if (cancelled) return;
        setItems(r.items);
        setHasMore(r.items.length >= PAGE);
      })
      .catch((e) => !cancelled && setError(errMsg(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query, tick]);

  const loadMore = async () => {
    if (!items?.length) return;
    setLoadingMore(true);
    try {
      const minBlock = Math.min(...items.map((i) => i.block_number));
      const r = await api.get<{ items: Activity[] }>(query(minBlock));
      const seen = new Set(items.map((i) => `${i.tx_hash}:${i.log_index}`));
      setItems([...items, ...r.items.filter((i) => !seen.has(`${i.tx_hash}:${i.log_index}`))]);
      setHasMore(r.items.length >= PAGE);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoadingMore(false);
    }
  };

  const groups = useMemo(() => {
    const out: { label: string; items: Activity[] }[] = [];
    for (const a of items ?? []) {
      const label = dayLabel(a.block_time);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(a);
      else out.push({ label, items: [a] });
    }
    return out;
  }, [items]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ledger"
        title="Activity"
        description="Every issue, transfer and redemption is read from Sepolia event logs and indexed for fast browsing. Open any row on Etherscan to verify it independently."
        actions={
          <Button variant="secondary" size="sm" onClick={() => setTick((t) => t + 1)} disabled={loading}>
            <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
            Refresh
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Filter by type">
          {FILTERS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60",
                filter === value
                  ? "border-violet-400/40 bg-violet-500/15 text-fg"
                  : "border-line bg-white/[0.02] text-muted hover:bg-white/[0.05] hover:text-fg",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
        {staff && (
          <Tabs<Scope>
            size="sm"
            value={scope}
            onChange={setScope}
            items={[
              { value: "me", label: "Mine" },
              { value: "all", label: "All campus" },
            ]}
          />
        )}
      </div>

      {loading && !items ? (
        <Card className="p-2">
          <ListSkeleton rows={8} />
        </Card>
      ) : error && !items ? (
        <ErrorState message={error} onRetry={() => setTick((t) => t + 1)} />
      ) : !items?.length ? (
        <Card>
          <EmptyState
            icon={History}
            title="No activity yet"
            description={
              filter === "all"
                ? "Once points are issued to, sent from or redeemed by your wallet, they show up here."
                : "Nothing matches this filter yet."
            }
          />
        </Card>
      ) : (
        <div className={cn("space-y-6 transition-opacity", loading && "opacity-60")}>
          {groups.map((g, gi) => (
            <motion.section
              key={g.label + gi}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(gi * 0.04, 0.3) }}
            >
              <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted">{g.label}</h2>
              <Card className="overflow-hidden">
                <ActivityList items={g.items} me={profile?.wallet_address} />
              </Card>
            </motion.section>
          ))}
          {hasMore && (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
                Load older activity
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
