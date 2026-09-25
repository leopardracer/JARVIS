"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, X } from "lucide-react";
import { THESIS_STANCES, type SearchHit } from "@jarvis/types";
import { Badge, Button, cn, Input, Label, Select, Spinner, Textarea } from "@jarvis/ui";
import { api, ApiError } from "@/lib/api";
import { formatDate, label } from "@/lib/format";
import { useServerAction } from "./actions";

export function NewThesisForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [issues, setIssues] = useState<Record<string, string[]>>({});
  const { run, busy, error } = useServerAction();

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus /> New thesis
      </Button>
    );
  }

  return (
    <form
      className="grid gap-4 border border-ink p-5 md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setIssues({});
        const row = await run(async () => {
          try {
            return await api<{ id: string }>("/api/theses", {
              method: "POST",
              body: JSON.stringify({
                title: f.get("title"),
                statement: f.get("statement"),
                stance: f.get("stance"),
                conviction: Number(f.get("conviction")),
                symbols: String(f.get("symbols") ?? "").split(/[\s,]+/).filter(Boolean),
              }),
            });
          } catch (err) {
            if (err instanceof ApiError && err.issues) setIssues(err.issues);
            throw err;
          }
        });
        if (row) router.push(`/app/research/theses/${row.id}`);
      }}
    >
      <div className="space-y-1.5 md:col-span-2">
        <Label htmlFor="t-title">Thesis</Label>
        <Input id="t-title" name="title" placeholder="Power becomes the bottleneck for AI data centers" required maxLength={200} aria-invalid={!!issues.title} />
      </div>
      <div className="space-y-1.5 md:col-span-2">
        <Label htmlFor="t-statement">Why you believe it, and what would change your mind</Label>
        <Textarea id="t-statement" name="statement" required maxLength={10000} aria-invalid={!!issues.statement} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="t-stance">Stance</Label>
        <Select id="t-stance" name="stance" defaultValue="bullish">
          {THESIS_STANCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="t-conviction">Conviction (1 to 5)</Label>
        <Select id="t-conviction" name="conviction" defaultValue="3">
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
        </Select>
      </div>
      <div className="space-y-1.5 md:col-span-2">
        <Label htmlFor="t-symbols">Assets (tickers, optional)</Label>
        <Input id="t-symbols" name="symbols" placeholder="NVDA, AMD" aria-invalid={!!issues.symbols} />
        {issues.symbols ? <p className="text-xs text-danger">{issues.symbols[0]}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <Button type="submit" disabled={busy}>{busy ? <Spinner /> : null} Save thesis</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        {error ? <span className="text-sm text-danger">{error}</span> : null}
        <span className="text-xs text-gray">Saved to memory too, so Ask and research can use it.</span>
      </div>
    </form>
  );
}

type ThesisState = { id: string; stance: string; conviction: number; status: string };

export function ThesisControls({ thesis }: { thesis: ThesisState }) {
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState({ stance: thesis.stance, conviction: thesis.conviction });
  const { run, busy, error } = useServerAction();
  const changed = draft.stance !== thesis.stance || draft.conviction !== thesis.conviction;
  const save = (patch: Partial<ThesisState>) =>
    run(() => api(`/api/theses/${thesis.id}`, { method: "PATCH", body: JSON.stringify({ ...patch, note: note || undefined }) })).then((r) => {
      if (r) setNote("");
    });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="eyebrow text-gray">Conviction</p>
        <div className="flex gap-1" role="radiogroup" aria-label="Conviction">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={draft.conviction === n}
              onClick={() => setDraft((d) => ({ ...d, conviction: n }))}
              className={cn("tabular size-9 border text-sm", n <= draft.conviction ? "border-cobalt bg-cobalt text-white" : "border-line text-gray hover:border-ink")}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="th-stance">Stance</Label>
        <Select id="th-stance" value={draft.stance} onChange={(e) => setDraft((d) => ({ ...d, stance: e.target.value }))}>
          {THESIS_STANCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="th-note">Why (saved to memory)</Label>
        <Textarea id="th-note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-20" maxLength={2000} placeholder="What made you change your mind?" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !changed} onClick={() => save(draft)}>{busy ? <Spinner /> : null} Save change</Button>
        <Button size="sm" variant={thesis.status === "active" ? "danger" : "outline"} disabled={busy} onClick={() => save({ status: thesis.status === "active" ? "closed" : "active" })}>
          {thesis.status === "active" ? "Close thesis" : "Reopen"}
        </Button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

type Hit = Omit<SearchHit, "memory"> & { memory: { id: string; title: string; type: string; createdAt: string; occurredAt: string | null } };

export function EvidenceLinker({ thesisId, exclude }: { thesisId: string; exclude: string[] }) {
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const { run, busy, error } = useServerAction();
  const results = useQuery({
    queryKey: ["evidence-search", submitted],
    enabled: submitted.length > 1,
    queryFn: () => api<Hit[]>(`/api/search?${new URLSearchParams({ q: submitted, mode: "hybrid", limit: "8" })}`),
  });
  const hits = (results.data ?? []).filter((h) => !exclude.includes(h.memory.id));
  const link = (memoryId: string, relation: "supports" | "contradicts") =>
    run(() => api(`/api/theses/${thesisId}/evidence`, { method: "POST", body: JSON.stringify({ memoryId, relation }) }));

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(q.trim());
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your memory for evidence" aria-label="Search memory" />
        <Button type="submit" variant="outline" size="icon" aria-label="Search"><Search /></Button>
      </form>
      {results.isFetching ? <Spinner /> : null}
      {submitted && !results.isFetching && !hits.length ? <p className="text-sm text-gray">No other memories match.</p> : null}
      <ul className="divide-y divide-line border-y border-line empty:hidden">
        {hits.map((h) => (
          <li key={h.memory.id} className="flex flex-wrap items-center gap-2 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{h.memory.title}</p>
              <p className="eyebrow text-gray">{label(h.memory.type)} · {formatDate(h.memory.occurredAt ?? h.memory.createdAt)}</p>
            </div>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => link(h.memory.id, "supports")}>Supports</Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => link(h.memory.id, "contradicts")}>Against</Button>
          </li>
        ))}
      </ul>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

export function RemoveEvidence({ thesisId, memoryId }: { thesisId: string; memoryId: string }) {
  const { run, busy } = useServerAction();
  return (
    <button
      type="button"
      disabled={busy}
      aria-label="Remove as evidence"
      onClick={() => run(() => api(`/api/theses/${thesisId}/evidence?memoryId=${memoryId}`, { method: "DELETE" }))}
      className="text-gray hover:text-danger disabled:opacity-40"
    >
      <X className="size-4" />
    </button>
  );
}

export function StanceBadge({ stance }: { stance: string }) {
  return <Badge tone={stance === "bearish" ? "danger" : stance === "neutral" ? "outline" : "cobalt"}>{stance}</Badge>;
}
