"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ArrowUp, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { ContextSource } from "@jarvis/types";
import { Badge, Button, cn, Kbd, Spinner } from "@jarvis/ui";
import { ask } from "@/lib/api";
import { formatShortDate, label } from "@/lib/format";

type Turn = {
  id: string;
  question: string;
  answer: string;
  sources: ContextSource[];
  provider?: string;
  model?: string;
  status: "retrieving" | "answering" | "done" | "error";
  error?: string;
};

type AskState = {
  open: boolean;
  turns: Turn[];
  busy: boolean;
  setOpen: (open: boolean) => void;
  submit: (question: string) => void;
  reset: () => void;
};

const AskContext = createContext<AskState | null>(null);

export function useAsk() {
  const ctx = useContext(AskContext);
  if (!ctx) throw new Error("useAsk must be used inside AskProvider");
  return ctx;
}

export function AskProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const conversationId = useRef<string | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  const update = (id: string, patch: Partial<Turn> | ((t: Turn) => Partial<Turn>)) =>
    setTurns((all) => all.map((t) => (t.id === id ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t)));

  const submit = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      setOpen(true);
      setBusy(true);
      const id = crypto.randomUUID();
      setTurns((all) => [...all, { id, question: q, answer: "", sources: [], status: "retrieving" }]);
      abort.current = new AbortController();
      try {
        for await (const e of ask(q, conversationId.current, abort.current.signal)) {
          if (e.type === "sources") update(id, { sources: e.sources, provider: e.provider, model: e.model, status: "answering" });
          else if (e.type === "text") update(id, (t) => ({ answer: t.answer + e.text }));
          else if (e.type === "done") {
            conversationId.current = e.conversationId;
            update(id, { status: "done" });
          } else if (e.type === "error") update(id, { status: "error", error: e.message });
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") update(id, { status: "error", error: "Connection lost. Try again." });
      } finally {
        setBusy(false);
        queryClient.invalidateQueries({ queryKey: ["activity"] });
      }
    },
    [busy, queryClient],
  );

  const reset = useCallback(() => {
    abort.current?.abort();
    conversationId.current = undefined;
    setTurns([]);
    setBusy(false);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <AskContext.Provider value={{ open, turns, busy, setOpen, submit, reset }}>
      {children}
      <AskDrawer />
    </AskContext.Provider>
  );
}

/** The large command box on the Overview page. */
export function CommandBox({ suggestions = [] }: { suggestions?: string[] }) {
  const { submit, busy } = useAsk();
  const [value, setValue] = useState("");
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
          setValue("");
        }}
        className="group flex items-center gap-3 border-2 border-ink bg-white px-4 transition-colors focus-within:border-cobalt sm:px-6"
      >
        <span className="size-2 shrink-0 bg-signal" aria-hidden />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask JARVIS anything about your financial world…"
          aria-label="Ask JARVIS"
          className="h-16 min-w-0 flex-1 bg-transparent text-lg tracking-tight placeholder:text-gray focus:outline-none sm:h-20 sm:text-2xl"
        />
        <Button type="submit" size="icon" disabled={!value.trim() || busy} aria-label="Ask" className="size-10 sm:size-12">
          {busy ? <Spinner /> : <ArrowUp />}
        </Button>
      </form>
      {suggestions.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              className="border border-line px-3 py-1.5 text-left text-sm text-gray transition-colors hover:border-ink hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AskDrawer() {
  const { open, setOpen, turns, submit, busy, reset } = useAsk();
  const [value, setValue] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [turns]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  return (
    <div className={cn("fixed inset-0 z-50", open ? "" : "pointer-events-none")} aria-hidden={!open}>
      <div
        className={cn("absolute inset-0 bg-ink/20 transition-opacity", open ? "opacity-100" : "opacity-0")}
        onClick={() => setOpen(false)}
      />
      <aside
        role="dialog"
        aria-label="Ask JARVIS"
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-ink bg-white transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="eyebrow flex items-center gap-2">
            <span className="size-1.5 bg-signal" /> Ask JARVIS
          </div>
          <div className="flex items-center gap-2">
            {turns.length ? (
              <Button variant="ghost" size="sm" onClick={reset}>
                New conversation
              </Button>
            ) : null}
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
              <X />
            </Button>
          </div>
        </header>

        <div className="flex-1 space-y-10 overflow-y-auto px-5 py-6">
          {turns.length === 0 ? (
            <div className="space-y-3 text-sm text-gray">
              <p className="text-2xl font-semibold tracking-tight text-ink">What do you want to know?</p>
              <p>JARVIS searches your memory and knowledge graph first, then answers with the sources it used.</p>
            </div>
          ) : (
            turns.map((t) => <TurnView key={t.id} turn={t} onNavigate={() => setOpen(false)} />)
          )}
          <div ref={end} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(value);
            setValue("");
          }}
          className="flex items-center gap-2 border-t border-ink p-3"
        >
          <input
            ref={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={turns.length ? "Ask a follow-up…" : "Ask about your theses, positions, research…"}
            className="h-11 min-w-0 flex-1 px-2 text-base focus:outline-none"
          />
          <Kbd className="hidden sm:inline">⌘K</Kbd>
          <Button type="submit" size="icon" disabled={!value.trim() || busy} aria-label="Ask">
            {busy ? <Spinner /> : <ArrowUp />}
          </Button>
        </form>
      </aside>
    </div>
  );
}

function TurnView({ turn, onNavigate }: { turn: Turn; onNavigate: () => void }) {
  const memories = turn.sources.filter((s): s is Extract<ContextSource, { kind: "memory" }> => s.kind === "memory");
  const entities = turn.sources.filter((s): s is Extract<ContextSource, { kind: "entity" }> => s.kind === "entity");
  return (
    <article className="space-y-4">
      <h3 className="text-xl font-semibold tracking-tight">{turn.question}</h3>

      {turn.status === "retrieving" ? (
        <p className="eyebrow flex items-center gap-2 text-gray">
          <Spinner className="size-3" /> Searching memory
        </p>
      ) : null}

      {turn.answer ? (
        <div className={cn("whitespace-pre-wrap text-[15px] leading-relaxed", turn.status === "answering" && "caret")}>
          <Cited text={turn.answer} />
        </div>
      ) : null}
      {turn.status === "error" ? <p className="text-sm text-danger">{turn.error}</p> : null}

      {turn.status !== "retrieving" ? (
        <section className="space-y-2 border-t border-line pt-3">
          <div className="eyebrow flex items-center justify-between text-gray">
            <span>Memory used · {memories.length}</span>
            {turn.provider ? <span>{turn.provider === "mock" ? "offline mode" : `${turn.provider} · ${turn.model}`}</span> : null}
          </div>
          {memories.length === 0 ? (
            <p className="text-sm text-gray">No saved memory matched. Nothing was made up to fill the gap.</p>
          ) : (
            <ol className="divide-y divide-line border-y border-line">
              {memories.map((m) => (
                <li key={m.id}>
                  <Link href={`/app/memory?id=${m.id}`} onClick={onNavigate} className="flex gap-3 py-2 text-sm hover:bg-surface">
                    <span className="w-7 shrink-0 font-mono text-xs text-cobalt">{m.ref}</span>
                    <span className="min-w-0 flex-1 truncate">{m.title}</span>
                    <span className="eyebrow shrink-0 text-gray">{label(m.type)}</span>
                    <span className="eyebrow hidden shrink-0 text-gray sm:inline">{formatShortDate(m.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          {entities.length ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {entities.map((e) => (
                <Link key={e.id} href={`/app/graph?focus=${e.id}`} onClick={onNavigate}>
                  <Badge tone="outline" className="hover:border-ink hover:text-ink">
                    {e.ref} · {e.name}
                  </Badge>
                </Link>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </article>
  );
}

/** Render [M1]/[E2] citations as small cobalt marks. */
function Cited({ text }: { text: string }) {
  const parts = text.split(/(\[(?:M|E)\d+\])/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\[(M|E)\d+\]$/.test(p) ? (
          <sup key={i} className="mx-0.5 font-mono text-[10px] text-cobalt">
            {p.slice(1, -1)}
          </sup>
        ) : (
          <span key={i}>{p.replace(/\*\*(.+?)\*\*/g, "$1")}</span>
        ),
      )}
    </>
  );
}
