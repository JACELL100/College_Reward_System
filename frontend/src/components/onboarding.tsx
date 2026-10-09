"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { Check, ExternalLink, Fuel } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/providers/auth-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { useLinkWallet } from "@/components/providers/use-link-wallet";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { api, errMsg } from "@/lib/api";
import { FAUCETS, explorerTx } from "@/lib/chain";
import { useApi } from "@/lib/use-api";
import type { GasDripStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const MIN_GAS_WEI = BigInt(5e14); // 0.0005 ETH ~ a handful of Sepolia txs

export function useGasDrip(enabled: boolean) {
  const status = useApi<GasDripStatus>(enabled ? "/api/wallet/gas-drip/status" : null);
  const { refreshBalances } = useWallet();
  const [busy, setBusy] = useState(false);
  const drip = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ tx_hash: string; amount_eth: number | string }>("/api/wallet/gas-drip", {}, { timeoutMs: 90_000 });
      toast.success(`Sent ${r.amount_eth} test ETH to your wallet`, {
        action: { label: "View tx", onClick: () => window.open(explorerTx(r.tx_hash), "_blank", "noopener") },
      });
      status.reload();
      setTimeout(() => void refreshBalances(), 8000);
      setTimeout(() => void refreshBalances(), 20000);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return { status: status.data, loading: status.loading, drip, busy };
}

export function GasHelp({ enabled }: { enabled: boolean }) {
  const { status, drip, busy } = useGasDrip(enabled);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status?.enabled && status.eligible && (
        <Button size="sm" variant="gold" onClick={() => void drip()} loading={busy}>
          {!busy && <Fuel className="size-3.5" />} Get {String(status.amount_eth)} test ETH
        </Button>
      )}
      {FAUCETS.slice(0, status?.eligible ? 1 : 2).map((f) => (
        <a
          key={f.url}
          href={f.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-xs text-muted hover:bg-white/[0.04] hover:text-fg"
        >
          {f.name} <ExternalLink className="size-3" />
        </a>
      ))}
      {status && !status.eligible && status.reason && <span className="text-[11px] text-subtle">{status.reason}</span>}
    </div>
  );
}

interface Step {
  key: string;
  title: string;
  desc: string;
  done: boolean;
  action?: React.ReactNode;
}

export function OnboardingChecklist() {
  const { session, profile } = useAuth();
  const w = useWallet();
  const { link, linking, linked } = useLinkWallet();
  const [assetAdded, setAssetAdded] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem("crp.asset.added") === "1";
    } catch {
      return false;
    }
  });

  const hasGas = w.ethBalance !== null && w.ethBalance >= MIN_GAS_WEI;
  const steps: Step[] = [
    { key: "signin", title: "Sign in with Google", desc: session?.user.email ?? "", done: !!session },
    {
      key: "install",
      title: "Install MetaMask",
      desc: w.isMobile ? "Open this site inside the MetaMask app browser" : "The browser wallet that holds your keys",
      done: w.installed,
      action: !w.installed ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            w.isMobile ? (window.location.href = w.deepLink) : window.open("https://metamask.io/download/", "_blank", "noopener")
          }
        >
          {w.isMobile ? "Open in MetaMask" : "Install"}
        </Button>
      ) : undefined,
    },
    {
      key: "connect",
      title: "Connect your wallet",
      desc: "Grant this site read access to your account address",
      done: !!w.address,
      action:
        w.installed && !w.address ? (
          <Button size="sm" onClick={() => void w.connect()} loading={w.connecting}>
            Connect
          </Button>
        ) : undefined,
    },
    {
      key: "network",
      title: "Switch to Sepolia",
      desc: "CampusCoin is deployed on the Ethereum Sepolia testnet",
      done: !!w.address && w.isCorrectChain,
      action:
        w.address && !w.isCorrectChain ? (
          <Button size="sm" variant="secondary" onClick={() => void w.switchChain()}>
            Switch network
          </Button>
        ) : undefined,
    },
    {
      key: "link",
      title: "Link wallet to your account",
      desc: "Sign a free message so classmates can find you",
      done: !!linked,
      action:
        !linked && w.address ? (
          <Button size="sm" onClick={() => void link()} loading={linking}>
            Sign & link
          </Button>
        ) : undefined,
    },
    {
      key: "gas",
      title: "Get test ETH for gas",
      desc: "Every transaction costs a tiny amount of Sepolia ETH",
      done: hasGas,
      action: w.address && !hasGas ? <GasHelp enabled={!!linked} /> : undefined,
    },
    {
      key: "asset",
      title: "Add CRP to MetaMask",
      desc: "See your points right inside your wallet",
      done: assetAdded,
      action:
        w.address && !assetAdded ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              await w.watchAsset();
              setAssetAdded(true);
              try {
                localStorage.setItem("crp.asset.added", "1");
              } catch {
                /* ignore */
              }
            }}
          >
            Add token
          </Button>
        ) : undefined,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  if (doneCount === steps.length && profile) return null;
  const nextIdx = steps.findIndex((s) => !s.done);

  return (
    <Card>
      <CardHeader
        title="Get set up"
        description={`${doneCount} of ${steps.length} complete`}
        action={
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className="h-full rounded-full bg-accent-gradient"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <span className="font-mono text-xs text-muted">{pct}%</span>
          </div>
        }
      />
      <ol className="mt-3 px-3 pb-3">
        {steps.map((s, i) => (
          <li
            key={s.key}
            className={cn(
              "flex flex-col gap-3 rounded-xl px-2 py-3 sm:flex-row sm:items-center",
              i === nextIdx && "bg-white/[0.025]",
            )}
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-medium",
                  s.done
                    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                    : i === nextIdx
                      ? "border-accent/50 text-accent"
                      : "border-line text-subtle",
                )}
              >
                {s.done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <div className="min-w-0">
                <div className={cn("text-sm font-medium", s.done ? "text-muted line-through decoration-white/20" : "text-fg")}>
                  {s.title}
                </div>
                {s.desc && <div className="truncate text-xs text-subtle">{s.desc}</div>}
              </div>
            </div>
            {!s.done && s.action && <div className="pl-9 sm:pl-0">{s.action}</div>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
