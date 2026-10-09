"use client";
import Link from "next/link";
import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "gold";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const base =
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent-gradient text-white shadow-[0_0_0_1px_rgb(255_255_255/0.12)_inset,0_8px_24px_-8px_rgb(124_92_246/0.6)] hover:brightness-110 hover:shadow-[0_0_0_1px_rgb(255_255_255/0.18)_inset,0_10px_32px_-8px_rgb(124_92_246/0.75)]",
  gold: "bg-gold-gradient text-black shadow-[0_0_0_1px_rgb(255_255_255/0.25)_inset,0_8px_24px_-10px_rgb(245_196_81/0.6)] hover:brightness-105",
  secondary:
    "bg-elevated text-fg border border-line shadow-[inset_0_1px_0_rgb(255_255_255/0.05)] hover:bg-hover hover:border-line-strong",
  outline: "border border-line-strong bg-transparent text-fg hover:bg-white/[0.04]",
  ghost: "bg-transparent text-muted hover:bg-white/[0.05] hover:text-fg",
  danger: "bg-red-500/10 text-red-300 border border-red-500/25 hover:bg-red-500/20",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
  icon: "size-9",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  external,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  if (external)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClass(variant, size, className)}>
        {children}
      </a>
    );
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
