"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Award, Gift, Pencil, Plus, Power, Tags } from "lucide-react";
import { RoleGuard } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { DynIcon, EmptyState, ErrorState, PageHeader, Points, Skeleton } from "@/components/ui/misc";
import { api, errMsg } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Category, StoreItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type Kind = "categories" | "items";

interface Draft {
  id?: number;
  name: string;
  description: string;
  value: string; // default_points or cost
  stock: string; // items only; blank = unlimited
  icon: string;
  active: boolean;
}

const EMPTY: Draft = { name: "", description: "", value: "", stock: "", icon: "", active: true };
const ICON_HINTS = ["Trophy", "Award", "Medal", "BookOpen", "Code", "Users", "HeartHandshake", "Coffee", "Shirt", "Ticket", "Printer", "FlaskConical"];

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function Tile({
  icon, name, description, value, valueLabel, extra, active, onEdit, onDeactivate, index,
}: {
  icon: string | null; name: string; description: string | null; value: number; valueLabel: string;
  extra?: React.ReactNode; active: boolean; onEdit: () => void; onDeactivate: () => void; index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className={cn("surface-card group flex flex-col gap-4 rounded-2xl p-4 transition-transform hover:-translate-y-0.5", !active && "opacity-55")}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-violet-500/10">
          <DynIcon name={icon} className="size-[18px] text-violet-300" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{name}</p>
            {!active && <Badge tone="neutral">Inactive</Badge>}
          </div>
          <p className="line-clamp-2 text-[13px] text-muted">{description || "No description"}</p>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2">
        <div className="text-xs text-muted">
          {valueLabel} <Points value={value} className="text-sm text-fg" />
          {extra}
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" aria-label={`Edit ${name}`} onClick={onEdit}>
            <Pencil className="size-4" />
          </Button>
          {active && (
            <Button size="icon" variant="ghost" aria-label={`Deactivate ${name}`} onClick={onDeactivate}>
              <Power className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function CatalogPage() {
  const [kind, setKind] = useState<Kind>("categories");
  const cats = useApi<Category[]>("/api/categories");
  const items = useApi<StoreItem[]>("/api/admin/store/items");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const isItems = kind === "items";
  const src = isItems ? items : cats;
  const base = isItems ? "/api/admin/store/items" : "/api/admin/categories";

  const valueErr = draft && (!/^\d+$/.test(draft.value) || Number(draft.value) < 1) ? "Whole number ≥ 1" : null;
  const stockErr = draft && isItems && draft.stock !== "" && !/^\d+$/.test(draft.stock) ? "Whole number, or blank for unlimited" : null;
  const nameErr = draft && !draft.name.trim() ? "Required" : null;

  const save = async () => {
    if (!draft || valueErr || stockErr || nameErr) return;
    setSaving(true);
    const body = isItems
      ? { name: draft.name.trim(), description: draft.description.trim() || null, cost: Number(draft.value), stock: draft.stock === "" ? null : Number(draft.stock), icon: draft.icon.trim() || null, active: draft.active }
      : { name: draft.name.trim(), description: draft.description.trim() || null, default_points: Number(draft.value), icon: draft.icon.trim() || null, active: draft.active };
    try {
      if (draft.id) await api.patch(`${base}/${draft.id}`, body);
      else await api.post(base, body);
      toast.success(draft.id ? "Saved" : "Created");
      setDraft(null);
      src.reload();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (id: number, name: string) => {
    try {
      await api.del(`${base}/${id}`);
      toast.success(`${name} deactivated`);
      src.reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Catalog"
        description="Reward categories guide how many points an achievement earns; store items are what students can redeem their CRP for."
        actions={
          <Button onClick={() => setDraft({ ...EMPTY })}>
            <Plus className="size-4" aria-hidden />
            {isItems ? "New store item" : "New category"}
          </Button>
        }
      />

      <Tabs<Kind>
        value={kind}
        onChange={setKind}
        items={[
          { value: "categories", label: <span className="inline-flex items-center gap-1.5"><Tags className="size-3.5" />Reward categories</span>, count: cats.data?.length },
          { value: "items", label: <span className="inline-flex items-center gap-1.5"><Gift className="size-3.5" />Store items</span>, count: items.data?.length },
        ]}
      />

      {src.loading && !src.data ? (
        <Grid>{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</Grid>
      ) : src.error && !src.data ? (
        <ErrorState message={src.error} onRetry={src.reload} />
      ) : !src.data?.length ? (
        <Card>
          <EmptyState icon={isItems ? Gift : Award} title={isItems ? "No store items yet" : "No categories yet"} action={<Button onClick={() => setDraft({ ...EMPTY })}>Create one</Button>} />
        </Card>
      ) : isItems ? (
        <Grid>
          {(items.data ?? []).map((it, i) => (
            <Tile
              key={it.id} index={i} icon={it.icon} name={it.name} description={it.description} value={it.cost} valueLabel="Cost"
              extra={<span className="ml-2">· {it.stock === null ? "Unlimited" : `${it.stock} left`}</span>}
              active={it.active}
              onEdit={() => setDraft({ id: it.id, name: it.name, description: it.description ?? "", value: String(it.cost), stock: it.stock === null ? "" : String(it.stock), icon: it.icon ?? "", active: it.active })}
              onDeactivate={() => deactivate(it.id, it.name)}
            />
          ))}
        </Grid>
      ) : (
        <Grid>
          {(cats.data ?? []).map((c, i) => (
            <Tile
              key={c.id} index={i} icon={c.icon} name={c.name} description={c.description} value={c.default_points} valueLabel="Default"
              active={c.active}
              onEdit={() => setDraft({ id: c.id, name: c.name, description: c.description ?? "", value: String(c.default_points), stock: "", icon: c.icon ?? "", active: c.active })}
              onDeactivate={() => deactivate(c.id, c.name)}
            />
          ))}
        </Grid>
      )}

      <Dialog
        open={!!draft}
        onClose={() => !saving && setDraft(null)}
        title={`${draft?.id ? "Edit" : "New"} ${isItems ? "store item" : "reward category"}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
            <Button onClick={save} loading={saving} disabled={!!(valueErr || stockErr || nameErr)}>Save</Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-line bg-violet-500/10">
                <DynIcon name={draft.icon} className="size-5 text-violet-300" />
              </span>
              <Field label="Name" error={nameErr && draft.name !== "" ? nameErr : undefined} className="flex-1" htmlFor="c-name">
                <Input id="c-name" value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
              </Field>
            </div>
            <Field label="Description" htmlFor="c-desc">
              <Textarea id="c-desc" rows={2} value={draft.description} maxLength={240} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={isItems ? "Cost (CRP)" : "Default points"} error={draft.value !== "" ? valueErr : undefined} htmlFor="c-val">
                <Input id="c-val" inputMode="numeric" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
              </Field>
              {isItems && (
                <Field label="Stock" hint="Blank = unlimited" error={stockErr} htmlFor="c-stock">
                  <Input id="c-stock" inputMode="numeric" value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} />
                </Field>
              )}
            </div>
            <Field label="Icon" hint="Any lucide icon name (PascalCase)" htmlFor="c-icon">
              <Input id="c-icon" placeholder="Trophy" value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {ICON_HINTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDraft({ ...draft, icon: n })}
                  aria-label={`Use ${n} icon`}
                  className={cn("grid size-8 place-items-center rounded-lg border transition-colors", draft.icon === n ? "border-violet-400/50 bg-violet-500/15" : "border-line hover:bg-white/[0.05]")}
                >
                  <DynIcon name={n} className="size-4" />
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input type="checkbox" className="size-4 accent-violet-500" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              Active (visible to students)
            </label>
          </div>
        )}
      </Dialog>
    </div>
  );
}

export default function AdminCatalogPage() {
  return (
    <RoleGuard roles={["admin"]}>
      <CatalogPage />
    </RoleGuard>
  );
}
