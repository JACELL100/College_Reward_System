"use client";
import { useId, useRef } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface TabItem<T extends string> {
  value: T;
  label: React.ReactNode;
  count?: number;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
  size = "md",
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    let n = -1;
    if (e.key === "ArrowRight") n = (i + 1) % items.length;
    if (e.key === "ArrowLeft") n = (i - 1 + items.length) % items.length;
    if (e.key === "Home") n = 0;
    if (e.key === "End") n = items.length - 1;
    if (n >= 0) {
      e.preventDefault();
      onChange(items[n].value);
      refs.current[n]?.focus();
    }
  };
  return (
    <div
      role="tablist"
      className={cn(
        "scrollbar-none inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-line bg-black/30 p-1",
        className,
      )}
    >
      {items.map((t, i) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(t.value)}
            className={cn(
              "relative shrink-0 rounded-lg font-medium transition-colors",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
              active ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            {active && (
              <motion.span
                layoutId={`tab-${id}`}
                className="absolute inset-0 rounded-lg border border-line-strong bg-elevated shadow-sm"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {t.label}
              {typeof t.count === "number" && (
                <span className="rounded-md bg-white/[0.06] px-1.5 text-[10px] tabular text-muted">{t.count}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
