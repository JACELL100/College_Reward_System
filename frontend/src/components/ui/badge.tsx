import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "gold";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-white/[0.05] text-muted border-line",
  accent: "bg-violet-500/10 text-violet-300 border-violet-500/20",
  success: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  danger: "bg-red-500/10 text-red-300 border-red-500/20",
  info: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
  gold: "bg-yellow-500/10 text-yellow-200 border-yellow-500/25",
};

export function Badge({
  tone = "neutral",
  className,
  dot,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  dot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const tone: BadgeTone = role === "admin" ? "gold" : role === "issuer" ? "accent" : "neutral";
  return (
    <Badge tone={tone} className="capitalize">
      {role}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone: BadgeTone = status === "fulfilled" ? "success" : status === "rejected" ? "danger" : "warning";
  return (
    <Badge tone={tone} dot className="capitalize">
      {status}
    </Badge>
  );
}
