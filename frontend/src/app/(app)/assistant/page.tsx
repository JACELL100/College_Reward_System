"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  ArrowUp,
  Check,
  Coins,
  Copy,
  Fuel,
  Gift,
  RefreshCw,
  Repeat2,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useAuth, displayName } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Avatar, CopyButton } from "@/components/ui/misc";
import { api, errMsg } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Msg extends ChatMessage {
  id: string;
}

const STORAGE_KEY = "crp-assistant-chat";
const MAX_HISTORY = 20;

const SUGGESTIONS = [
  { label: "How many points do I have?", icon: Coins },
  { label: "What can I redeem?", icon: Gift },
  { label: "Explain gas fees", icon: Fuel },
  { label: "How does an ERC20 transfer work?", icon: Repeat2 },
];

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function loadStored(): Msg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is Msg =>
        !!m &&
        typeof m === "object" &&
        typeof (m as Msg).id === "string" &&
        typeof (m as Msg).content === "string" &&
        ((m as Msg).role === "user" || (m as Msg).role === "assistant"),
    );
  } catch {
    return [];
  }
}

/* ------------------------------ Markdown ------------------------------ */
function PreBlock({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ref.current?.textContent ?? "");
      setDone(true);
      toast.success("Code copied");
      setTimeout(() => setDone(false), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  };
  return (
    <div className="group/code relative my-2">
      <pre ref={ref} className="my-0! pr-10">
        {children}
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy code"
        className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-md border border-line bg-elevated/80 text-subtle backdrop-blur transition hover:text-fg sm:opacity-0 sm:group-hover/code:opacity-100 sm:focus-visible:opacity-100"
      >
        {done ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

const mdComponents: Components = {
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-line">
      <table className="w-full border-collapse text-left text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-line bg-white/[0.04] px-3 py-2 font-medium">{children}</th>,
  td: ({ children }) => <td className="border-b border-line/60 px-3 py-2 align-top">{children}</td>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="break-words">
      {children}
    </a>
  ),
  pre: ({ children }) => <PreBlock>{children}</PreBlock>,
  li: ({ children }) => <li className="my-0.5 marker:text-subtle">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-accent/50 pl-3 text-muted">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-line" />,
};

function Markdown({ content }: { content: string }) {
  return (
    <div className="prose-chat break-words text-[14px] leading-relaxed text-fg/90 [&>*:first-child]:mt-0! [&>*:last-child]:mb-0!">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{content}</ReactMarkdown>
    </div>
  );
}

/* ------------------------------ Pieces ------------------------------ */
function BotAvatar({ size = 32 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="relative grid shrink-0 place-items-center rounded-full border border-white/10 bg-accent-gradient shadow-[0_0_24px_-6px_rgb(139_124_246/0.7)]"
      aria-hidden
    >
      <Sparkles className="size-[45%] text-white" />
    </div>
  );
}

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      className="flex items-end gap-3"
      role="status"
      aria-label="Assistant is typing"
    >
      <BotAvatar />
      <div className="flex h-10 items-center gap-1.5 rounded-2xl rounded-bl-md border border-line bg-elevated px-4">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-muted"
            animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
          />
        ))}
      </div>
    </motion.div>
  );
}

function MessageBubble({
  msg,
  userName,
  userAvatar,
  userSeed,
}: {
  msg: Msg;
  userName: string;
  userAvatar?: string | null;
  userSeed?: string | null;
}) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={cn("flex items-end gap-3", isUser && "flex-row-reverse")}
    >
      {isUser ? (
        <Avatar src={userAvatar} name={userName} seed={userSeed} size={32} className="hidden sm:grid" />
      ) : (
        <BotAvatar />
      )}
      <div
        className={cn(
          "group/msg relative min-w-0 max-w-[85%] sm:max-w-[75%]",
          isUser
            ? "rounded-2xl rounded-br-md bg-accent-gradient px-4 py-2.5 text-[14px] leading-relaxed text-white shadow-[0_0_0_1px_rgb(255_255_255/0.12)_inset,0_8px_24px_-12px_rgb(124_92_246/0.7)]"
            : "rounded-2xl rounded-bl-md border border-line bg-elevated px-4 py-3",
        )}
      >
        {isUser ? <p className="whitespace-pre-wrap break-words">{msg.content}</p> : <Markdown content={msg.content} />}
        {!isUser && (
          <div className="absolute -bottom-3 right-2 opacity-0 transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100">
            <CopyButton text={msg.content} label="Copy reply" className="border border-line bg-surface" />
          </div>
        )}
      </div>
    </motion.div>
  );
}

function EmptyIntro({ onPick, disabled }: { onPick: (q: string) => void; disabled: boolean }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-2 py-8 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="relative"
      >
        <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-accent-gradient opacity-25 blur-2xl" />
        <BotAvatar size={56} />
      </motion.div>
      <motion.h2
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mt-5 text-xl font-semibold tracking-[-0.02em] text-fg sm:text-2xl"
      >
        Hi, I&apos;m your <span className="text-gradient">CampusCoin</span> assistant
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-2 max-w-md text-sm text-muted"
      >
        I know your CRP balance, rank, recent activity and the reward store, and I can explain how Ethereum and ERC20
        tokens work under the hood.
      </motion.p>
      <div className="mt-7 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.button
              key={s.label}
              type="button"
              disabled={disabled}
              onClick={() => onPick(s.label)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.05 }}
              whileHover={{ y: -2 }}
              className="group flex items-center gap-3 rounded-xl border border-line bg-white/[0.02] px-3.5 py-3 text-left text-sm text-muted transition-colors hover:border-line-strong hover:bg-white/[0.04] hover:text-fg disabled:opacity-50"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-elevated text-subtle transition-colors group-hover:text-accent">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">{s.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------ Page ------------------------------ */
export default function AssistantPage() {
  const { profile, session } = useAuth();
  const [messages, setMessages] = useState<Msg[]>(loadStored);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const userName = displayName(profile ?? { email: session?.user.email });
  const userAvatar = profile?.avatar_url ?? (session?.user.user_metadata?.avatar_url as string | undefined);

  // Persist the conversation for this browser tab session.
  useEffect(() => {
    try {
      if (messages.length) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50)));
      else window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }, [messages]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, sending, failed]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const resize = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, []);

  const request = useCallback(async (history: Msg[]) => {
    setSending(true);
    setFailed(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const r = await api.post<{ reply: string }>(
        "/api/ai/chat",
        { messages: history.slice(-MAX_HISTORY).map(({ role, content }) => ({ role, content })) },
        { timeoutMs: 60_000, signal: ctrl.signal },
      );
      if (ctrl.signal.aborted) return;
      const reply = (r?.reply ?? "").trim() || "Sorry, I couldn't come up with an answer. Please try rephrasing.";
      setMessages((m) => [...m, { id: uid(), role: "assistant", content: reply }]);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const msg = errMsg(e);
      setFailed(msg);
      toast.error("Assistant couldn't reply", {
        description: msg,
        action: { label: "Retry", onClick: () => void request(history) },
      });
    } finally {
      if (abortRef.current === ctrl) {
        abortRef.current = null;
        setSending(false);
      }
    }
  }, []);

  const send = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || sending) return;
      const next: Msg[] = [...messages, { id: uid(), role: "user", content }];
      setMessages(next);
      setInput("");
      requestAnimationFrame(() => {
        resize();
        taRef.current?.focus();
      });
      void request(next);
    },
    [messages, sending, request, resize],
  );

  const retry = () => {
    if (sending || !messages.length || messages[messages.length - 1].role !== "user") return;
    void request(messages);
  };

  const clear = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
    setFailed(null);
    setMessages([]);
    setInput("");
    requestAnimationFrame(() => {
      resize();
      taRef.current?.focus();
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  };

  const empty = messages.length === 0;
  const lastIsUser = !empty && messages[messages.length - 1].role === "user";

  return (
    <div className="flex h-[calc(100dvh-12.5rem)] min-h-[440px] flex-col sm:h-[calc(100dvh-13rem)] lg:h-[calc(100dvh-9rem)]">
      <div className="surface-card relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
          <BotAvatar size={34} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold tracking-tight text-fg">AI assistant</h1>
            <p className="flex items-center gap-1.5 truncate text-xs text-muted">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
              </span>
              Grounded in your balance, activity &amp; the reward store
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clear}
            disabled={empty && !sending}
            aria-label="Clear chat"
            className="shrink-0"
          >
            <Trash2 className="size-3.5" />
            <span className="hidden sm:inline">Clear chat</span>
          </Button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6"
          aria-live="polite"
          aria-busy={sending}
        >
          {empty && !sending ? (
            <EmptyIntro onPick={send} disabled={sending} />
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-5">
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  msg={m}
                  userName={userName}
                  userAvatar={userAvatar}
                  userSeed={profile?.id}
                />
              ))}
              <AnimatePresence>{sending && <TypingIndicator key="typing" />}</AnimatePresence>
              {failed && !sending && lastIsUser && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-start gap-3 rounded-xl border border-red-500/15 bg-red-500/[0.05] px-4 py-3 text-sm sm:ml-11 sm:flex-row sm:items-center"
                >
                  <TriangleAlert className="hidden size-4 shrink-0 text-red-300 sm:block" />
                  <span className="min-w-0 flex-1 text-red-100/90">{failed}</span>
                  <Button size="sm" variant="secondary" onClick={retry}>
                    <RefreshCw className="size-3.5" /> Retry
                  </Button>
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-line bg-surface/80 p-3 backdrop-blur sm:p-4">
          <form
            className="mx-auto max-w-3xl"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <div className="flex items-end gap-2 rounded-2xl border border-line bg-black/30 p-1.5 pl-4 transition-colors focus-within:border-accent/50 focus-within:shadow-[0_0_0_4px_rgb(139_124_246/0.12)]">
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  resize();
                }}
                onKeyDown={onKeyDown}
                rows={1}
                maxLength={4000}
                placeholder={sending ? "Waiting for reply…" : "Ask about your points, rewards or Ethereum…"}
                aria-label="Message the assistant"
                disabled={sending}
                className="max-h-[200px] min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[14px] leading-relaxed text-fg placeholder:text-subtle focus:outline-none disabled:opacity-60"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || sending}
                loading={sending}
                aria-label="Send message"
                className="shrink-0 rounded-xl"
              >
                {!sending && <ArrowUp className="size-4" />}
              </Button>
            </div>
            <p className="mt-2 hidden text-center text-[11px] text-subtle sm:block">
              <kbd className="font-mono">Enter</kbd> to send · <kbd className="font-mono">Shift + Enter</kbd> for a new
              line · AI can make mistakes, check on-chain data for anything important.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
