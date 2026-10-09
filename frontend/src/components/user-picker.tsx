"use client";
import { useEffect, useState } from "react";
import { isAddress } from "ethers";
import { Check, Search, Wallet } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import type { DirectoryEntry } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/misc";
import { RoleBadge } from "@/components/ui/badge";
import { cn, shortAddr } from "@/lib/utils";

export interface PickedRecipient {
  address: string;
  name: string | null;
  avatar_url?: string | null;
  id?: string;
  department?: string | null;
}

export function useDirectory(q: string, enabled = true) {
  const [items, setItems] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await api.get<DirectoryEntry[]>(`/api/directory?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        setItems(r ?? []);
      } catch (e) {
        if (!ctrl.signal.aborted) setError(errMsg(e));
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, enabled]);
  return { items, loading, error };
}

export function UserPicker({
  value,
  onChange,
  exclude,
  placeholder = "Search by name, department or paste a 0x address",
}: {
  value: PickedRecipient | null;
  onChange: (r: PickedRecipient | null) => void;
  exclude?: string | null;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const { items, loading, error } = useDirectory(q);
  const pasted = q.trim();
  const isAddr = isAddress(pasted);
  const list = items.filter((i) => i.wallet_address?.toLowerCase() !== exclude?.toLowerCase());

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="pl-9"
          aria-label="Search recipients"
          spellCheck={false}
        />
      </div>
      {isAddr && (
        <button
          onClick={() => onChange({ address: pasted.toLowerCase(), name: null })}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
            value?.address === pasted.toLowerCase()
              ? "border-accent/50 bg-accent/10"
              : "border-line bg-black/20 hover:bg-white/[0.03]",
          )}
        >
          <div className="grid size-9 place-items-center rounded-full border border-line bg-elevated">
            <Wallet className="size-4 text-muted" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Send to pasted address</div>
            <div className="truncate font-mono text-xs text-muted">{pasted}</div>
          </div>
          {value?.address === pasted.toLowerCase() && <Check className="size-4 text-accent" />}
        </button>
      )}
      {!isAddr && (pasted as string).startsWith("0x") && (pasted as string).length >= 42 && !isAddress(pasted) && (
        <p className="text-xs text-red-300">That doesn&apos;t look like a valid Ethereum address (checksum mismatch?).</p>
      )}
      <div className="max-h-72 overflow-y-auto rounded-xl border border-line bg-black/20">
        {loading && !list.length ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-white/[0.04]" />
            ))}
          </div>
        ) : error ? (
          <p className="p-4 text-center text-xs text-red-300">{error}</p>
        ) : list.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted">
            {q ? "No one matches that search." : "No other users have signed up yet."}
          </p>
        ) : (
          <ul className="divide-y divide-line/60">
            {list.map((u) => {
              const wallet = u.wallet_address?.toLowerCase() ?? null;
              const sel = !!wallet && value?.address === wallet;
              return (
                <li key={u.id}>
                  <button
                    disabled={!wallet}
                    title={wallet ? undefined : "This person hasn't linked a wallet yet, so they can't receive CRP"}
                    onClick={() =>
                      wallet &&
                      onChange({
                        address: wallet,
                        name: u.full_name,
                        avatar_url: u.avatar_url,
                        id: u.id,
                        department: u.department,
                      })
                    }
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                      !wallet ? "cursor-not-allowed opacity-55" : sel ? "bg-accent/10" : "hover:bg-white/[0.03]",
                    )}
                  >
                    <Avatar src={u.avatar_url} name={u.full_name} seed={wallet ?? u.id} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{u.full_name ?? "Unnamed"}</span>
                        {u.role !== "student" && <RoleBadge role={u.role} />}
                      </div>
                      <div className="truncate text-xs text-muted">
                        {[u.department, u.email_hint].filter(Boolean).join(" · ") || (wallet ? shortAddr(wallet) : "")}
                      </div>
                    </div>
                    {wallet ? (
                      <span className="hidden font-mono text-[11px] text-subtle sm:block">{shortAddr(wallet)}</span>
                    ) : (
                      <span className="shrink-0 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
                        No wallet linked
                      </span>
                    )}
                    {sel && <Check className="size-4 shrink-0 text-accent" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
