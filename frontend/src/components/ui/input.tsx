import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-xl border border-line bg-black/30 px-3.5 text-sm text-fg placeholder:text-subtle shadow-[inset_0_1px_2px_rgb(0_0_0/0.3)] transition-colors hover:border-line-strong focus:border-accent/60 focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(field, "h-10", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(field, "min-h-[88px] resize-y py-2.5", className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(field, "h-10 appearance-none pr-9 [&>option]:bg-elevated", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
});

export function Field({
  label,
  hint,
  error,
  htmlFor,
  right,
  children,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-xs font-medium text-muted">
          {label}
        </label>
        {right && <div className="text-xs text-subtle">{right}</div>}
      </div>
      {children}
      {error ? (
        <p className="text-xs text-red-300">{error}</p>
      ) : hint ? (
        <p className="text-xs text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
