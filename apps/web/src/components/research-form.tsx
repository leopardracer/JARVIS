"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button, Spinner, Textarea } from "@jarvis/ui";
import { api } from "@/lib/api";
import { useServerAction } from "./actions";

export function ResearchForm({ offline, suggestions = [] }: { offline: boolean; suggestions?: string[] }) {
  const [query, setQuery] = useState("");
  const { run, busy, error } = useServerAction();

  async function submit(q: string) {
    if (q.trim().length < 3) return;
    const r = await run(() => api("/api/research", { method: "POST", body: JSON.stringify({ query: q }) }));
    if (r) setQuery("");
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit(query);
      }}
    >
      <Textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="What do you want to understand? For example: what would break my AI infrastructure thesis?"
        className="min-h-24"
        maxLength={1000}
        disabled={busy}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || query.trim().length < 3}>
          {busy ? <Spinner /> : <ArrowRight />} {busy ? "Researching your memory" : "Run research"}
        </Button>
        <span className="text-xs text-gray">
          {offline ? "Offline mode: the brief quotes your memory. Add an AI key for a reasoned brief." : "JARVIS reads your memory and graph, writes a cited brief, and saves it as a research note."}
        </span>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {suggestions.length && !busy ? (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => submit(s)} className="border border-line px-2.5 py-1 text-left text-xs text-gray hover:border-ink hover:text-ink">
              {s}
            </button>
          ))}
        </div>
      ) : null}
    </form>
  );
}
