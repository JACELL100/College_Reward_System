"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Check, PackageCheck, RefreshCw, X } from "lucide-react";
import { RoleGuard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Avatar, CopyButton, DynIcon, EmptyState, ErrorState, ListSkeleton, PageHeader, Points, TxLink } from "@/components/ui/misc";
import { api, errMsg } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Redemption, RedemptionStatus } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

type Filter = RedemptionStatus | "all";

function RedemptionsPage() {
  const [filter, setFilter] = useState<Filter>("pending");
  const { data, loading, error, reload } = useApi<Redemption[]>("/api/admin/redemptions");
  const [overrides, setOverrides] = useState<Record<number, Redemption>>({});
  const [busy, setBusy] = useState<number | null>(null);

  const all = useMemo(() => (data ?? []).map((r) => overrides[r.id] ?? r), [data, overrides]);
  const counts = useMemo(() => {
    const c = { pending: 0, fulfilled: 0, rejected: 0 };
    for (const r of all) c[r.status]++;
    return c;
  }, [all]);
  const rows = filter === "all" ? all : all.filter((r) => r.status === filter);

  const act = async (r: Redemption, status: "fulfilled" | "rejected") => {
    setBusy(r.id);
    setOverrides((o) => ({ ...o, [r.id]: { ...r, status } }));
    try {
      const updated = await api.post<Redemption>(`/api/admin/redemptions/${r.id}/status`, { status });
      setOverrides((o) => ({ ...o, [r.id]: { ...r, ...updated, profile: updated.profile ?? r.profile } }));
      toast.success(status === "fulfilled" ? `Voucher ${r.code} fulfilled` : `Voucher ${r.code} rejected`);
    } catch (e) {
      setOverrides((o) => {
        const n = { ...o };
        delete n[r.id];
        return n;
      });
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Redemptions"
        description="Students burn CRP on-chain with redeem(). Hand over the reward when they show their voucher code, then mark it fulfilled."
        actions={
          <Button variant="secondary" size="sm" onClick={() => { setOverrides({}); reload(); }} disabled={loading}>
            <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
            Refresh
          </Button>
        }
      />

      <Tabs<Filter>
        value={filter}
        onChange={setFilter}
        items={[
          { value: "pending", label: "Pending", count: counts.pending },
          { value: "fulfilled", label: "Fulfilled", count: counts.fulfilled },
          { value: "rejected", label: "Rejected", count: counts.rejected },
          { value: "all", label: "All", count: all.length },
        ]}
      />

      {loading && !data ? (
        <Card className="p-2"><ListSkeleton rows={6} /></Card>
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !rows.length ? (
        <Card>
          <EmptyState
            icon={PackageCheck}
            title={filter === "pending" ? "All caught up" : "Nothing here"}
            description={filter === "pending" ? "No vouchers are waiting to be fulfilled." : "No redemptions match this filter."}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line/60">
            <AnimatePresence initial={false}>
              {rows.map((r, i) => (
                <motion.li
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i * 0.03, 0.25) } }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar src={r.profile?.avatar_url} name={r.profile?.full_name ?? r.profile?.email} seed={r.profile?.id} size={40} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.profile?.full_name ?? "Unknown student"}</p>
                      <p className="truncate text-xs text-muted">{r.profile?.email}</p>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-white/[0.03]">
                      <DynIcon name={r.item?.icon} className="size-4 text-violet-300" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.item?.name ?? `Item #${r.item?.id ?? "?"}`}</p>
                      <p className="text-xs text-muted">
                        <Points value={r.amount} className="text-xs" /> · {timeAgo(r.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                    <span className="inline-flex items-center gap-1 rounded-lg border border-line bg-black/30 px-2.5 py-1 font-mono text-sm tracking-[0.2em]">
                      {r.code}
                      <CopyButton text={r.code} label="Copy code" />
                    </span>
                    <TxLink hash={r.tx_hash} />
                    <StatusBadge status={r.status} />
                    {r.status === "pending" && (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => act(r, "fulfilled")} loading={busy === r.id}>
                          <Check className="size-4" aria-hidden />
                          Fulfil
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => act(r, "rejected")} disabled={busy === r.id}>
                          <X className="size-4" aria-hidden />
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </Card>
      )}
    </div>
  );
}

export default function AdminRedemptionsPage() {
  return (
    <RoleGuard roles={["admin"]}>
      <RedemptionsPage />
    </RoleGuard>
  );
}
