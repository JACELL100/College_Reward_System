"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  BookOpen,
  Bot,
  Coins,
  Crown,
  Gift,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageCheck,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  TriangleAlert,
  Trophy,
  UserRound,
  X,
} from "lucide-react";
import { useAuth, displayName } from "@/components/providers/auth-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { useLinkWallet } from "@/components/providers/use-link-wallet";
import { Logo } from "@/components/logo";
import { WalletButton, MenuItem, useClickOutside } from "@/components/wallet-button";
import { Avatar } from "@/components/ui/misc";
import { RoleBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, shortAddr } from "@/lib/utils";
import { isContractConfigured } from "@/lib/env";
import type { Role } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Role[];
}

const MAIN: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/send", label: "Send", icon: Send },
  { href: "/store", label: "Reward store", icon: Store },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/assistant", label: "AI assistant", icon: Bot },
];
const MANAGE: NavItem[] = [
  { href: "/admin/issue", label: "Issue points", icon: Sparkles, roles: ["issuer", "admin"] },
  { href: "/admin", label: "Admin overview", icon: ShieldCheck, roles: ["admin"] },
  { href: "/admin/issuers", label: "Issuers", icon: Crown, roles: ["admin"] },
  { href: "/admin/catalog", label: "Catalog", icon: Gift, roles: ["admin"] },
  { href: "/admin/redemptions", label: "Redemptions", icon: PackageCheck, roles: ["admin"] },
];
const MORE: NavItem[] = [
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/about", label: "How it works", icon: BookOpen },
];
const MOBILE: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/send", label: "Send", icon: Send },
  { href: "/store", label: "Store", icon: Store },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/assistant", label: "AI", icon: Bot },
];

function isActive(path: string, href: string) {
  if (href === "/admin") return path === "/admin";
  return path === href || path.startsWith(href + "/");
}

function NavList({ items, path, onNav }: { items: NavItem[]; path: string; onNav?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {items.map((it) => {
        const active = isActive(path, it.href);
        const Icon = it.icon;
        return (
          <li key={it.href}>
            <Link
              href={it.href}
              onClick={onNav}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                active ? "text-fg" : "text-muted hover:bg-white/[0.035] hover:text-fg",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-xl border border-line bg-white/[0.05] shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <Icon className={cn("relative size-4", active ? "text-accent" : "text-subtle group-hover:text-muted")} />
              <span className="relative">{it.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SidebarContent({ path, onNav }: { path: string; onNav?: () => void }) {
  const { role } = useAuth();
  const manage = MANAGE.filter((i) => !i.roles || i.roles.includes(role));
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-6 pt-5">
        <Logo href="/dashboard" />
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3" aria-label="Main">
        <NavList items={MAIN} path={path} onNav={onNav} />
        {manage.length > 0 && (
          <div>
            <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">Manage</div>
            <NavList items={manage} path={path} onNav={onNav} />
          </div>
        )}
        <div>
          <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-subtle">Account</div>
          <NavList items={MORE} path={path} onNav={onNav} />
        </div>
      </nav>
      <div className="m-3 rounded-2xl border border-line bg-black/20 p-3.5">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
          </span>
          Ethereum Sepolia testnet
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-subtle">Test tokens only. No real value.</p>
      </div>
    </div>
  );
}

function UserMenu() {
  const { profile, session, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const name = displayName(profile ?? { email: session?.user.email });
  const avatar = profile?.avatar_url ?? (session?.user.user_metadata?.avatar_url as string | undefined);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-full ring-offset-2 ring-offset-bg transition hover:ring-2 hover:ring-line-strong"
      >
        <Avatar src={avatar} name={name} seed={profile?.id} size={34} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-line p-4">
              <Avatar src={avatar} name={name} seed={profile?.id} size={40} />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{name}</div>
                <div className="truncate text-xs text-muted">{profile?.email ?? session?.user.email}</div>
                {profile && (
                  <div className="mt-1.5">
                    <RoleBadge role={profile.role} />
                  </div>
                )}
              </div>
            </div>
            <div className="p-1.5">
              <MenuItem
                icon={<Settings className="size-4" />}
                onClick={() => {
                  setOpen(false);
                  router.push("/profile");
                }}
              >
                Profile & wallet
              </MenuItem>
              <MenuItem
                icon={<BookOpen className="size-4" />}
                onClick={() => {
                  setOpen(false);
                  router.push("/about");
                }}
              >
                How it works
              </MenuItem>
              <MenuItem
                icon={<LogOut className="size-4" />}
                onClick={async () => {
                  setOpen(false);
                  await signOut();
                  router.replace("/login");
                }}
              >
                Sign out
              </MenuItem>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Banners() {
  const w = useWallet();
  const { profileError, refreshProfile } = useAuth();
  const { mismatch, linked } = useLinkWallet();
  const items: React.ReactNode[] = [];
  if (!isContractConfigured)
    items.push(
      <Banner key="c" tone="warning">
        Contract not configured. Set <code className="font-mono">NEXT_PUBLIC_CONTRACT_ADDRESS</code> to enable on-chain features.
      </Banner>,
    );
  if (w.address && !w.isCorrectChain)
    items.push(
      <Banner
        key="n"
        tone="warning"
        action={
          <Button size="sm" variant="secondary" onClick={() => void w.switchChain()}>
            Switch to Sepolia
          </Button>
        }
      >
        MetaMask is on the wrong network. CampusCoin lives on Ethereum Sepolia.
      </Banner>,
    );
  if (mismatch)
    items.push(
      <Banner key="m" tone="info">
        Connected account {shortAddr(w.address)} differs from your linked wallet {shortAddr(linked)}. Switch accounts in
        MetaMask or re-link on your profile.
      </Banner>,
    );
  if (profileError)
    items.push(
      <Banner
        key="p"
        tone="danger"
        action={
          <Button size="sm" variant="secondary" onClick={() => void refreshProfile()}>
            Retry
          </Button>
        }
      >
        Couldn&apos;t load your profile: {profileError}
      </Banner>,
    );
  if (!items.length) return null;
  return <div className="space-y-2 px-4 pt-4 sm:px-6 lg:px-8">{items}</div>;
}

function Banner({
  tone,
  children,
  action,
}: {
  tone: "warning" | "info" | "danger";
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const t =
    tone === "warning"
      ? "border-amber-500/20 bg-amber-500/[0.06] text-amber-100"
      : tone === "danger"
        ? "border-red-500/20 bg-red-500/[0.06] text-red-100"
        : "border-cyan-500/20 bg-cyan-500/[0.06] text-cyan-100";
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center", t)}>
      <TriangleAlert className="hidden size-4 shrink-0 opacity-80 sm:block" />
      <div className="flex-1">{children}</div>
      {action}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { session, ready } = useAuth();
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    if (ready && !session) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [ready, session, router, path]);

  if (!ready || !session) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="flex items-center gap-3 text-sm text-muted">
          <Coins className="size-5 animate-spin text-accent [animation-duration:1.6s]" />
          Loading your wallet…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-surface/60 backdrop-blur-xl lg:block">
        <SidebarContent path={path} />
      </aside>

      {/* Mobile sheet */}
      <AnimatePresence>
        {sheet && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSheet(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 40 }}
              className="absolute inset-y-0 left-0 w-[82%] max-w-xs border-r border-line bg-surface"
            >
              <button
                onClick={() => setSheet(false)}
                aria-label="Close menu"
                className="absolute right-3 top-4 grid size-9 place-items-center rounded-lg text-muted hover:bg-white/5"
              >
                <X className="size-4" />
              </button>
              <SidebarContent path={path} onNav={() => setSheet(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Top bar */}
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-bg/70 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <button
          onClick={() => setSheet(true)}
          aria-label="Open menu"
          className="grid size-9 place-items-center rounded-lg border border-line text-muted hover:bg-white/5 lg:hidden"
        >
          <Menu className="size-4" />
        </button>
        <div className="lg:hidden">
          <Logo href="/dashboard" className="[&>span]:hidden sm:[&>span]:flex" />
        </div>
        <div className="flex-1" />
        <WalletButton />
        <UserMenu />
      </header>

      <Banners />

      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-12">
        <motion.div
          key={path}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          {children}
        </motion.div>
      </main>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Quick"
        className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-around rounded-2xl border border-line bg-surface/85 px-1 py-1.5 shadow-2xl backdrop-blur-xl lg:hidden"
      >
        {MOBILE.map((it) => {
          const active = isActive(path, it.href);
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium transition-colors",
                active ? "bg-white/[0.06] text-fg" : "text-subtle",
              )}
            >
              <Icon className={cn("size-[18px]", active && "text-accent")} />
              {it.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Role guard for admin/issuer pages (UI-only; the chain enforces real permissions). */
export function RoleGuard({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { profile, profileLoading, profileError } = useAuth();
  if (!profile && (profileLoading || !profileError)) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-white/[0.05]" />
        <div className="h-40 animate-pulse rounded-2xl bg-white/[0.04]" />
      </div>
    );
  }
  if (!profile || !roles.includes(profile.role)) {
    return (
      <div className="surface-card mx-auto mt-10 max-w-md rounded-2xl p-8 text-center">
        <ShieldCheck className="mx-auto size-8 text-subtle" />
        <h2 className="mt-4 text-lg font-semibold tracking-tight">Restricted area</h2>
        <p className="mt-1.5 text-sm text-muted">
          This page needs the <span className="text-fg">{roles.join(" or ")}</span> role. Roles come from the blockchain:
          the contract owner is admin and wallets added with <code className="font-mono">addIssuer</code> are issuers.
        </p>
        <Link href="/dashboard" className="mt-5 inline-block text-sm text-accent hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
