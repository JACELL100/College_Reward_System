"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Bot, ChevronDown, CornerDownLeft, Sparkles, Wand2 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/misc";
import { api, errMsg } from "@/lib/api";
import type { RewardSuggestion } from "@/lib/types";
import { cn, fmt } from "@/lib/utils";

const EXAMPLES = [
  "Won 2nd place at the inter-college hackathon with a team of 4",
  "Volunteered all 3 days at the annual tech fest registration desk",
  "Published a paper at an IEEE conference as first author",
];

export function AdminIssueAdvisor({
  onApply,
  targetLabel,
}: {
  onApply: (s: RewardSuggestion) => void;
  targetLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<RewardSuggestion | null>(null);

  const ask = async () => {
    const d = description.trim();
    if (d.length < 6) {
      toast.error("Describe the achievement in a few more words");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await api.post<RewardSuggestion>("/api/ai/suggest-reward", { description: d }, { timeoutMs: 45_000 });
      setSuggestion(r);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-accent-gradient opacity-[0.08] blur-3xl" />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left lg:pointer-events-none"
        aria-expanded={open}
      >
        <CardHeader
          title="AI Reward Advisor"
          description="Describe what the student did and get a suggested reward."
          icon={<Bot className="size-4 text-accent-2" />}
          className="pb-5 lg:pb-0"
          action={
            <ChevronDown
              className={cn("size-4 text-muted transition-transform lg:hidden", open && "rotate-180")}
              aria-hidden
            />
          }
        />
      </button>
      <div className={cn(open ? "block" : "hidden", "lg:block")}>
        <CardBody className="space-y-4 pt-4">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 600))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void ask();
              }
            }}
            placeholder="e.g. Led the robotics club to a state-level podium finish…"
            aria-label="Describe the achievement"
            className="min-h-[110px]"
          />
          {!description && (
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setDescription(ex)}
                  className="rounded-full border border-line bg-black/20 px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  {ex.length > 38 ? ex.slice(0, 38) + "…" : ex}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="hidden items-center gap-1 text-[11px] text-subtle sm:flex">
              <CornerDownLeft className="size-3" /> Ctrl + Enter
            </span>
            <Button onClick={() => void ask()} loading={loading} variant="secondary" size="sm" className="ml-auto">
              {!loading && <Wand2 className="size-3.5" />} Suggest reward
            </Button>
          </div>

          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3 rounded-xl border border-line bg-black/20 p-4"
                aria-busy="true"
                aria-label="Thinking"
              >
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-7 w-16" />
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-3/5" />
                <Skeleton className="h-8 w-full" />
              </motion.div>
            ) : error ? (
              <motion.p
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-3 text-xs text-red-200"
              >
                {error}
              </motion.p>
            ) : suggestion ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-3 rounded-xl border border-accent/25 bg-accent/[0.06] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.12em] text-subtle">Suggested</div>
                    <div className="mt-1">
                      {suggestion.category_name ? (
                        <Badge tone="accent">{suggestion.category_name}</Badge>
                      ) : (
                        <Badge>Custom</Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-2xl font-semibold tabular text-fg">{fmt(suggestion.points)}</div>
                    <div className="text-[11px] text-subtle">CRP</div>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-muted">On-chain reason</div>
                  <p className="mt-0.5 text-sm text-fg">&ldquo;{suggestion.reason}&rdquo;</p>
                </div>
                {suggestion.rationale && (
                  <div>
                    <div className="text-[11px] font-medium text-muted">Why</div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{suggestion.rationale}</p>
                  </div>
                )}
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    onApply(suggestion);
                    toast.success(`Applied to ${targetLabel}`);
                  }}
                >
                  <Sparkles className="size-3.5" /> Apply to {targetLabel}
                </Button>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <p className="text-[11px] leading-relaxed text-subtle">
            Suggestions are advisory. You stay in control: review the amount and reason before signing.
          </p>
        </CardBody>
      </div>
    </Card>
  );
}
