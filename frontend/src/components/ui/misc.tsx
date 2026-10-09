"use client";
import { useEffect, useRef, useState } from "react";
import { animate, motion, useReducedMotion } from "motion/react";
import {
  Award,
  BookOpen,
  CalendarCheck,
  Check,
  Coins,
  Copy,
  ExternalLink,
  FileText,
  FlaskConical,
  Gift,
  HandHeart,
  HeartHandshake,
  Medal,
  Printer,
  Shirt,
  Star,
  Ticket,
  Trophy,
  Users,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn, fmt, initials, seedGradient, shortAddr, shortHash } from "@/lib/utils";
import { explorerAddr, explorerTx } from "@/lib/chain";

/* ------------------------------ Skeleton ------------------------------ */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-white/[0.05]", className)} aria-hidden>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ Avatar ------------------------------ */
export function Avatar({
  src,
  name,
  seed,
  size = 36,
  className,
}: {
  src?: string | null;
  name?: string | null;
  seed?: string | null;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };
  if (src && !broken)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? ""}
        style={style}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={cn("shrink-0 rounded-full border border-line object-cover", className)}
      />
    );
  return (
    <div
      style={{ ...style, background: seedGradient(seed ?? name) }}
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full border border-white/10 text-[11px] font-semibold text-white",
        className,
      )}
      aria-label={name ?? undefined}
    >
      {name ? <span className="drop-shadow-[0_1px_2px_rgb(0_0_0/0.6)]">{initials(name)}</span> : null}
    </div>
  );
}

/* ------------------------------ Tooltip ------------------------------ */
export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-elevated px-2 py-1 text-[11px] text-fg opacity-0 shadow-lg transition-opacity duration-150 group-hover/tt:opacity-100 group-focus-within/tt:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}

/* ------------------------------ Empty / Error ------------------------------ */
export function EmptyState({
  icon: Icon = Gift,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <div className="relative mb-4 grid size-12 place-items-center rounded-2xl border border-line bg-elevated text-muted">
        <div className="absolute inset-0 rounded-2xl bg-accent-gradient opacity-10 blur-xl" />
        <Icon className="relative size-5" />
      </div>
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-red-500/15 bg-red-500/[0.04] px-6 py-10 text-center">
      <p className="text-sm font-medium text-red-200">Couldn&apos;t load this</p>
      <p className="mt-1 max-w-md text-sm text-muted">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-lg border border-line bg-elevated px-3 py-1.5 text-xs font-medium hover:bg-hover"
        >
          Try again
        </button>
      )}
    </div>
  );
}

/* ------------------------------ CountUp ------------------------------ */
export function CountUp({ value, className, duration = 1.1 }: { value: number; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = fmt(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = fmt(Math.round(v));
      },
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, duration, reduce]);
  return (
    <span ref={ref} className={cn("tabular", className)}>
      {fmt(0)}
    </span>
  );
}

/* ------------------------------ StatCard ------------------------------ */
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  loading,
  className,
}: {
  label: string;
  value: number | string | null | undefined;
  icon?: LucideIcon;
  hint?: React.ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={cn("surface-card rounded-2xl p-4 sm:p-5", className)}
    >
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        {Icon && <Icon className="size-4 text-subtle" aria-hidden />}
      </div>
      <div className="mt-3 font-mono text-2xl font-semibold tracking-tight text-fg">
        {loading ? (
          <Skeleton className="h-7 w-20" />
        ) : typeof value === "number" ? (
          <CountUp value={value} />
        ) : (
          (value ?? "—")
        )}
      </div>
      {hint && <div className="mt-1 text-xs text-subtle">{hint}</div>}
    </motion.div>
  );
}

/* ------------------------------ AddressChip / TxLink ------------------------------ */
export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          toast.success("Copied to clipboard");
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error("Couldn't copy");
        }
      }}
      className={cn("grid size-6 place-items-center rounded-md text-subtle hover:bg-white/5 hover:text-fg", className)}
    >
      {done ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
    </button>
  );
}

export function AddressChip({
  address,
  className,
  link = true,
  chars = 4,
}: {
  address: string | null | undefined;
  className?: string;
  link?: boolean;
  chars?: number;
}) {
  if (!address) return <span className="text-subtle">—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-line bg-black/30 py-0.5 pl-1 pr-0.5 font-mono text-xs text-fg",
        className,
      )}
    >
      <span className="size-4 shrink-0 rounded-full" style={{ background: seedGradient(address) }} aria-hidden />
      {link ? (
        <a
          href={explorerAddr(address)}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-accent-2"
          title={address}
        >
          {shortAddr(address, chars)}
        </a>
      ) : (
        <span title={address}>{shortAddr(address, chars)}</span>
      )}
      <CopyButton text={address} label="Copy address" />
    </span>
  );
}

export function TxLink({ hash, className }: { hash: string; className?: string }) {
  return (
    <a
      href={explorerTx(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex items-center gap-1 font-mono text-xs text-muted hover:text-accent-2", className)}
      title={hash}
    >
      {shortHash(hash)}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}

/* ------------------------------ Dynamic icon by name ------------------------------ */
const ICONS: Record<string, LucideIcon> = {
  trophy: Trophy,
  "file-text": FileText,
  filetext: FileText,
  "heart-handshake": HeartHandshake,
  "hand-heart": HandHeart,
  "calendar-check": CalendarCheck,
  medal: Medal,
  users: Users,
  utensils: Utensils,
  "book-open": BookOpen,
  book: BookOpen,
  shirt: Shirt,
  printer: Printer,
  ticket: Ticket,
  "flask-conical": FlaskConical,
  flask: FlaskConical,
  gift: Gift,
  coins: Coins,
  star: Star,
  award: Award,
};

export function DynIcon({ name, className, fallback = Award }: { name?: string | null; className?: string; fallback?: LucideIcon }) {
  const key = (name ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
  const I = ICONS[key] ?? fallback;
  return <I className={className} aria-hidden />;
}

/* ------------------------------ Page header ------------------------------ */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-subtle">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-[-0.025em] text-fg sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------ Coin amount ------------------------------ */
export function Points({ value, className, sign }: { value: number; className?: string; sign?: "+" | "-" | "" }) {
  return (
    <span className={cn("font-mono tabular font-medium", className)}>
      {sign}
      {fmt(value)} <span className="text-[0.8em] text-subtle">CRP</span>
    </span>
  );
}
