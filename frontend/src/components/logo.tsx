import Link from "next/link";
import { cn } from "@/lib/utils";

export function CoinMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="cm-a" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#818CF8" />
          <stop offset="0.5" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
        <linearGradient id="cm-b" x1="16" y1="6" x2="16" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill="url(#cm-a)" />
      <circle cx="16" cy="16" r="11.5" stroke="#fff" strokeOpacity="0.28" strokeWidth="1" />
      <path
        d="M20.6 12.2a6 6 0 1 0 0 7.6"
        stroke="url(#cm-b)"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M16 9.5v13" stroke="#fff" strokeOpacity="0.5" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5", className)} aria-label="CampusCoin home">
      <CoinMark className="transition-transform duration-500 group-hover:rotate-[20deg]" />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-fg">CampusCoin</span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-subtle">FRCRCE · CRP</span>
      </span>
    </Link>
  );
}
