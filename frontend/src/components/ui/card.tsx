import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("surface-card rounded-2xl", className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-5", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-elevated text-muted">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-fg">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}
