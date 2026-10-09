"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { AlertTriangle, PauseCircle, ShieldCheck, Sparkles, User, Users, Wallet } from "lucide-react";
import { RoleGuard } from "@/components/app-shell";
import { useWallet } from "@/components/providers/wallet-provider";
import { useContractState, useIsIssuerOnchain } from "@/components/onchain-hooks";
import { AdminIssueSingle } from "@/components/admin-issue-single";
import { AdminIssueBatch } from "@/components/admin-issue-batch";
import { AdminIssueAdvisor } from "@/components/admin-issue-advisor";
import type { ApplyHandle } from "@/components/admin-issue-shared";
import { BATCH_MAX } from "@/components/admin-issue-shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/misc";
import { useApi } from "@/lib/use-api";
import type { Category } from "@/lib/types";
import { fmt } from "@/lib/utils";

type Mode = "single" | "batch";

function Banner({ tone, icon: Icon, title, children }: {
  tone: "warning" | "danger" | "info";
  icon: typeof AlertTriangle;
  title: string;
  children?: React.ReactNode;
}) {
  const tones = {
    warning: "border-amber-500/25 bg-amber-500/[0.06] text-amber-200",
    danger: "border-red-500/25 bg-red-500/[0.06] text-red-200",
    info: "border-cyan-500/25 bg-cyan-500/[0.06] text-cyan-200",
  } as const;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${tones[tone]}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="font-medium">{title}</p>
        {children && <div className="text-[13px] leading-relaxed opacity-80">{children}</div>}
      </div>
    </motion.div>
  );
}

function IssuePage() {
  const wallet = useWallet();
  const { state } = useContractState();
  const { isIssuer, loading: issuerLoading } = useIsIssuerOnchain(wallet.address);
  const { data: categories, loading: categoriesLoading } = useApi<Category[]>("/api/categories");
  const [mode, setMode] = useState<Mode>("single");
  const singleRef = useRef<ApplyHandle>(null);
  const batchRef = useRef<ApplyHandle>(null);

  const maxIssue = state?.maxIssuePerTx ?? null;
  const paused = state?.paused ?? false;
  const notConnected = !wallet.address;
  const wrongChain = !!wallet.address && !wallet.isCorrectChain;
  const notIssuer = !!wallet.address && !issuerLoading && isIssuer === false;
  const blocked = notConnected || wrongChain || notIssuer || paused;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Issuer console"
        title="Issue reward points"
        description="Mint CRP directly to students' wallets. Every issuance is an on-chain transaction signed by your MetaMask account, with the reason stored in the contract event log."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {maxIssue !== null && <Badge tone="neutral">Max {fmt(maxIssue)} CRP / recipient</Badge>}
            <Badge tone="neutral">Batch ≤ {BATCH_MAX}</Badge>
            {isIssuer && (
              <Badge tone="success" dot>
                Authorised issuer
              </Badge>
            )}
          </div>
        }
      />

      <div className="space-y-3">
        {notConnected && (
          <Banner tone="info" icon={Wallet} title="Connect MetaMask to issue points">
            <Button size="sm" className="mt-2" onClick={() => wallet.connect()} loading={wallet.connecting}>
              Connect wallet
            </Button>
          </Banner>
        )}
        {wrongChain && (
          <Banner tone="warning" icon={AlertTriangle} title="MetaMask is on the wrong network">
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => wallet.switchChain()}>
              Switch to Sepolia
            </Button>
          </Banner>
        )}
        {notIssuer && (
          <Banner tone="danger" icon={ShieldCheck} title="This wallet is not an authorised issuer on-chain">
            The contract rejects <code className="font-mono">issueReward</code> from accounts without the issuer role.
            Ask the contract owner to grant it on the{" "}
            <Link href="/admin/issuers" className="underline underline-offset-2">
              Issuers
            </Link>{" "}
            page, or switch MetaMask to an issuer account.
          </Banner>
        )}
        {paused && (
          <Banner tone="warning" icon={PauseCircle} title="The contract is paused">
            Issuance and transfers are disabled until the owner unpauses it from the admin overview.
          </Banner>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-5 sm:p-6">
          <Tabs<Mode>
            className="mb-6"
            value={mode}
            onChange={setMode}
            items={[
              { value: "single", label: <span className="inline-flex items-center gap-1.5"><User className="size-3.5" />Single</span> },
              { value: "batch", label: <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" />Batch</span> },
            ]}
          />
          <div className={mode === "single" ? "" : "hidden"}>
            <AdminIssueSingle
              ref={singleRef}
              categories={categories}
              categoriesLoading={categoriesLoading}
              maxIssue={maxIssue}
              blocked={blocked}
            />
          </div>
          <div className={mode === "batch" ? "" : "hidden"}>
            <AdminIssueBatch
              ref={batchRef}
              categories={categories}
              categoriesLoading={categoriesLoading}
              maxIssue={maxIssue}
              blocked={blocked}
            />
          </div>
        </Card>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <AdminIssueAdvisor
            targetLabel={mode === "single" ? "single issue form" : "batch form"}
            onApply={(s) => (mode === "single" ? singleRef : batchRef).current?.apply(s)}
          />
          <p className="mt-3 flex items-start gap-2 px-1 text-xs leading-relaxed text-muted">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-violet-300" aria-hidden />
            AI suggestions are advisory. You review and sign every transaction yourself in MetaMask.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AdminIssuePage() {
  return (
    <RoleGuard roles={["issuer", "admin"]}>
      <IssuePage />
    </RoleGuard>
  );
}
