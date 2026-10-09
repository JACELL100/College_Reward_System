"use client";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  dismissable?: boolean;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) onClose();
      if (e.key === "Tab" && panel.current) {
        const els = panel.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      const el = panel.current?.querySelector<HTMLElement>("[data-autofocus], input, textarea, button");
      el?.focus();
    }, 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose, dismissable]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => dismissable && onClose()}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-t`}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className={cn(
              "relative max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border border-line bg-surface shadow-2xl sm:max-w-md sm:rounded-3xl",
              className,
            )}
          >
            <div className="flex items-start justify-between gap-4 px-6 pt-6">
              <div>
                <h2 id={`${id}-t`} className="text-base font-semibold tracking-tight">
                  {title}
                </h2>
                {description && <p className="mt-1 text-sm text-muted">{description}</p>}
              </div>
              {dismissable && (
                <button
                  onClick={onClose}
                  aria-label="Close dialog"
                  className="-mr-2 -mt-1 grid size-8 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-fg"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="px-6 py-5">{children}</div>
            {footer && (
              <div className="flex flex-col-reverse gap-2 border-t border-line px-6 py-4 sm:flex-row sm:justify-end">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
