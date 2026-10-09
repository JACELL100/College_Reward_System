"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { AlertTriangle, Coins, ExternalLink, Fuel, Link2, Link2Off, Save, UserRound, Wallet } from "lucide-react";
import { displayName, useAuth } from "@/components/providers/auth-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { useLinkWallet } from "@/components/providers/use-link-wallet";
import { GasHelp } from "@/components/onboarding";
import { ChangePasswordCard } from "@/components/change-password-card";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, RoleBadge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { AddressChip, Avatar, PageHeader, Points, Skeleton } from "@/components/ui/misc";
import { api, errMsg } from "@/lib/api";
import { CONTRACT_ADDRESS, explorerToken } from "@/lib/chain";
import { isContractConfigured } from "@/lib/env";
import type { Profile } from "@/lib/types";
import { fmtEth } from "@/lib/utils";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  );
}

export default function ProfilePage() {
  const { profile, setProfile, session } = useAuth();
  const wallet = useWallet();
  const { link, unlink, linking, linked, mismatch } = useLinkWallet();
  const [form, setForm] = useState({ full_name: "", department: "", roll_no: "" });
  const [saving, setSaving] = useState(false);
  const providers = (session?.user.app_metadata?.providers as string[] | undefined) ?? [session?.user.app_metadata?.provider];
  const isEmailUser = providers.includes("email");

  // Re-sync the form whenever a new profile object arrives (adjusting state during render).
  const [syncedFrom, setSyncedFrom] = useState<Profile | null>(null);
  if (profile && profile !== syncedFrom) {
    setSyncedFrom(profile);
    setForm({
      full_name: profile.full_name ?? "",
      department: profile.department ?? "",
      roll_no: profile.roll_no ?? "",
    });
  }

  const dirty =
    !!profile &&
    (form.full_name !== (profile.full_name ?? "") ||
      form.department !== (profile.department ?? "") ||
      form.roll_no !== (profile.roll_no ?? ""));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const p = await api.patch<Profile>("/api/me", {
        full_name: form.full_name.trim() || null,
        department: form.department.trim() || null,
        roll_no: form.roll_no.trim() || null,
      });
      setProfile(p);
      toast.success("Profile saved");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Account" title="Profile & wallet" description="Your campus identity, linked wallet and token settings." />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="surface-card flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center"
      >
        <Avatar src={profile.avatar_url} name={displayName(profile)} seed={profile.id} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold tracking-tight">{displayName(profile)}</h2>
            <RoleBadge role={profile.role} />
            {profile.is_contract_owner && <Badge tone="gold">Contract owner</Badge>}
          </div>
          <p className="truncate text-sm text-muted">{profile.email ?? session?.user.email}</p>
        </div>
        {wallet.crpBalance !== null && (
          <div className="text-left sm:text-right">
            <p className="text-xs uppercase tracking-wider text-muted">Balance</p>
            <Points value={Number(wallet.crpBalance)} className="text-2xl font-semibold" />
          </div>
        )}
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Personal details" description="Shown to classmates in the directory and leaderboard." icon={<UserRound className="size-4" />} />
          <CardBody>
            <form onSubmit={save} className="space-y-4">
              <Field label="Full name" htmlFor="full_name">
                <Input id="full_name" value={form.full_name} maxLength={80} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Department" htmlFor="department">
                  <Input id="department" placeholder="e.g. Computer Engineering" value={form.department} maxLength={60} onChange={(e) => setForm({ ...form, department: e.target.value })} />
                </Field>
                <Field label="Roll number" htmlFor="roll_no">
                  <Input id="roll_no" placeholder="e.g. 10189" value={form.roll_no} maxLength={20} onChange={(e) => setForm({ ...form, roll_no: e.target.value })} />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button type="submit" loading={saving} disabled={!dirty}>
                  <Save className="size-4" aria-hidden />
                  Save changes
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Wallet" description="Linking proves ownership with a free signature, no gas." icon={<Wallet className="size-4" />} />
          <CardBody className="space-y-4">
            <div className="divide-y divide-line/60">
              <Row label="Linked wallet">{linked ? <AddressChip address={linked} link /> : <span className="text-muted">Not linked</span>}</Row>
              <Row label="MetaMask account">
                {wallet.address ? <AddressChip address={wallet.address} /> : <span className="text-muted">Not connected</span>}
              </Row>
              <Row label="Network">
                {!wallet.address ? (
                  <span className="text-muted">—</span>
                ) : wallet.isCorrectChain ? (
                  <Badge tone="success" dot>Sepolia</Badge>
                ) : (
                  <Badge tone="warning" dot>Wrong network</Badge>
                )}
              </Row>
              <Row label="Gas balance">
                <span className="font-mono tabular-nums">{wallet.ethBalance !== null ? `${fmtEth(wallet.ethBalance)} ETH` : "—"}</span>
              </Row>
            </div>

            {mismatch && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-[13px] text-amber-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                MetaMask is on a different account than your linked wallet. Switch accounts in MetaMask, or relink to use this one.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {!wallet.installed && wallet.hydrated ? (
                <a href={wallet.isMobile ? wallet.deepLink : "https://metamask.io/download/"} target="_blank" rel="noreferrer">
                  <Button variant="secondary">Install MetaMask</Button>
                </a>
              ) : !wallet.address ? (
                <Button onClick={() => wallet.connect()} loading={wallet.connecting}>Connect MetaMask</Button>
              ) : (
                <>
                  {!wallet.isCorrectChain && (
                    <Button variant="secondary" onClick={() => wallet.switchChain()}>Switch to Sepolia</Button>
                  )}
                  {(!linked || mismatch) && (
                    <Button onClick={() => link()} loading={linking}>
                      <Link2 className="size-4" aria-hidden />
                      {linked ? "Relink to this account" : "Link this wallet"}
                    </Button>
                  )}
                </>
              )}
              {linked && (
                <Button variant="ghost" onClick={() => unlink()} disabled={linking}>
                  <Link2Off className="size-4" aria-hidden />
                  Unlink
                </Button>
              )}
            </div>
          </CardBody>
        </Card>

        {isEmailUser && <ChangePasswordCard />}

        <Card>
          <CardHeader title="Gas for transactions" description="Transfers and redemptions need a little Sepolia ETH." icon={<Fuel className="size-4" />} />
          <CardBody>
            <GasHelp enabled={!!linked} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="CRP token" description="ERC20 · College Reward Points" icon={<Coins className="size-4" />} />
          <CardBody className="space-y-4">
            <div className="divide-y divide-line/60">
              <Row label="Symbol"><span className="font-mono">CRP</span></Row>
              <Row label="Decimals"><span className="font-mono">0</span></Row>
              <Row label="Network"><span>Sepolia testnet</span></Row>
              <Row label="Contract">{isContractConfigured ? <AddressChip address={CONTRACT_ADDRESS} link /> : <span className="text-muted">Not configured</span>}</Row>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => wallet.watchAsset()} disabled={!wallet.installed || !isContractConfigured}>
                <Coins className="size-4" aria-hidden />
                Add CRP to MetaMask
              </Button>
              {isContractConfigured && (
                <a href={explorerToken()} target="_blank" rel="noreferrer">
                  <Button variant="ghost">
                    Etherscan
                    <ExternalLink className="size-3.5" aria-hidden />
                  </Button>
                </a>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
