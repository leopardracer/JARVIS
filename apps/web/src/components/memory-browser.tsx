"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Trash2, X } from "lucide-react";
import { MEMORY_TYPES, type MemoryType, type MemoryWithEntities, type Page, type SearchHit, type SearchMode } from "@jarvis/types";
import { Badge, Button, cn, Input, Label, Select, Skeleton, Spinner, Textarea } from "@jarvis/ui";
import { api, ApiError } from "@/lib/api";
import { formatDate, label } from "@/lib/format";
import { EmptyState } from "./brand";

type Row = Omit<MemoryWithEntities, "createdAt" | "updatedAt" | "occurredAt"> & { createdAt: string; updatedAt: string; occurredAt: string | null };

const when = (m: Row) => m.occurredAt ?? m.createdAt;

export function MemoryBrowser() {
  const params = useSearchParams();
  const router = useRouter();
  const selectedId = params.get("id");
  const entityId = params.get("entity");

  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [mode, setMode] = useState<SearchMode>("hybrid");
  const [types, setTypes] = useState<MemoryType[]>([]);
  const [composing, setComposing] = useState(false);

  const setParam = (key: string, value: string | null) => {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    router.replace(url.pathname + url.search, { scroll: false });
  };

  const list = useInfiniteQuery({
    queryKey: ["memories", types, entityId],
    enabled: !submitted,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const sp = new URLSearchParams({ limit: "20" });
      if (types.length) sp.set("types", types.join(","));
      if (entityId) sp.set("entityIds", entityId);
      if (pageParam) sp.set("cursor", pageParam);
      return api<Page<Row>>(`/api/memories?${sp}`);
    },
    getNextPageParam: (last) => last.nextCursor,
  });

  const search = useQuery({
    queryKey: ["search", submitted, mode, types],
    enabled: !!submitted,
    queryFn: () => {
      const sp = new URLSearchParams({ q: submitted, mode, limit: "20" });
      if (types.length) sp.set("types", types.join(","));
      return api<(Omit<SearchHit, "memory"> & { memory: Row })[]>(`/api/search?${sp}`);
    },
  });

  const rows: { memory: Row; matchedBy?: string[] }[] = submitted
    ? (search.data ?? []).map((h) => ({ memory: h.memory, matchedBy: h.matchedBy }))
    : (list.data?.pages.flatMap((p) => p.items) ?? []).map((m) => ({ memory: m }));
  const loading = submitted ? search.isLoading : list.isLoading;
  const error = submitted ? search.error : list.error;

  return (
    <div className="grid border-t border-line lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
      <section className="min-w-0 space-y-5 px-4 py-6 sm:px-8">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(q.trim());
          }}
          className="flex flex-wrap gap-2"
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value) setSubmitted(""); }} placeholder="Search your memory…" aria-label="Search memory" className="pl-9" />
          </div>
          <div className="flex border border-line" role="group" aria-label="Search mode">
            {(["hybrid", "semantic", "exact"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn("eyebrow px-3", mode === m ? "bg-ink text-white" : "text-gray hover:text-ink")}
              >
                {m}
              </button>
            ))}
          </div>
          <Button type="submit" variant="secondary">Search</Button>
          <Button variant="primary" onClick={() => setComposing(true)}>
            <Plus /> New memory
          </Button>
        </form>

        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by type">
          {MEMORY_TYPES.map((t) => {
            const on = types.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => setTypes((all) => (on ? all.filter((x) => x !== t) : [...all, t]))}
                className={cn("eyebrow border px-2 py-1", on ? "border-cobalt bg-cobalt text-white" : "border-line text-gray hover:border-ink hover:text-ink")}
              >
                {label(t)}
              </button>
            );
          })}
          {entityId ? (
            <button type="button" onClick={() => setParam("entity", null)} className="eyebrow flex items-center gap-1 border border-ink px-2 py-1">
              Entity filter <X className="size-3" />
            </button>
          ) : null}
        </div>

        {composing ? <Composer onClose={() => setComposing(false)} onCreated={(id) => { setComposing(false); setParam("id", id); }} /> : null}

        {submitted ? (
          <p className="eyebrow text-gray">
            {search.isLoading ? "Searching…" : `${rows.length} results for “${submitted}” · ${mode}`}
          </p>
        ) : null}

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : error ? (
          <p className="text-sm text-danger">Could not load memories: {(error as Error).message}</p>
        ) : rows.length === 0 ? (
          submitted ? (
            <p className="py-10 text-sm text-gray">Nothing in your memory matches that. Try hybrid mode or different words.</p>
          ) : (
            <EmptyState title="Nothing remembered yet" action={<Button onClick={() => setComposing(true)}><Plus /> Save a memory</Button>}>
              Save a note, thesis, trade or piece of research. JARVIS links the companies, assets and themes it mentions.
            </EmptyState>
          )
        ) : (
          <ol className="divide-y divide-line border-y border-line">
            {rows.map(({ memory: m, matchedBy }) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setParam("id", m.id)}
                  className={cn("grid w-full grid-cols-[88px_1fr] gap-4 py-3 text-left transition-colors hover:bg-surface sm:grid-cols-[110px_1fr_auto]", selectedId === m.id && "bg-surface")}
                >
                  <span className="eyebrow pt-0.5 text-gray">{label(m.type)}</span>
                  <span className="min-w-0 space-y-1">
                    <span className="block font-medium">{m.title}</span>
                    <span className="line-clamp-2 block text-sm text-gray">{m.content}</span>
                    {m.entities.length ? (
                      <span className="flex flex-wrap gap-1 pt-1">
                        {m.entities.slice(0, 6).map((e) => <Badge key={e.id}>{e.symbol ?? e.name}</Badge>)}
                      </span>
                    ) : null}
                  </span>
                  <span className="eyebrow hidden text-right text-gray sm:block">
                    {formatDate(when(m))}
                    {matchedBy ? <span className="mt-1 block text-cobalt">{matchedBy.join(" + ")}</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}

        {!submitted && list.hasNextPage ? (
          <Button variant="outline" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
            {list.isFetchingNextPage ? <Spinner /> : null} Load older memories
          </Button>
        ) : null}
      </section>

      <aside className="border-t border-line lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:border-l lg:border-t-0">
        {selectedId ? (
          <MemoryDetail key={selectedId} id={selectedId} onClose={() => setParam("id", null)} onSelect={(id) => setParam("id", id)} />
        ) : (
          <div className="space-y-3 p-6 text-sm text-gray">
            <p className="eyebrow text-ink">How search works</p>
            <p><strong className="font-medium text-ink">Exact</strong> matches words and phrases.</p>
            <p><strong className="font-medium text-ink">Semantic</strong> matches meaning using embeddings, so “chip risk” finds notes about export rules.</p>
            <p><strong className="font-medium text-ink">Hybrid</strong> blends both with the entities in your graph. It is the default.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function Composer({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ type: "note" as MemoryType, title: "", content: "", tags: "", sourceUrl: "" });
  const create = useMutation({
    mutationFn: () =>
      api<Row>("/api/memories", {
        method: "POST",
        body: JSON.stringify({
          type: form.type,
          title: form.title,
          content: form.content,
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
          sourceUrl: form.sourceUrl || null,
        }),
      }),
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ["memories"] });
      qc.invalidateQueries({ queryKey: ["graph"] });
      onCreated(m.id);
    },
  });
  const issues = create.error instanceof ApiError ? create.error.issues : undefined;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
      className="space-y-4 border-2 border-ink p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">New memory</h2>
        <button type="button" onClick={onClose} aria-label="Cancel" className="text-gray hover:text-ink"><X className="size-4" /></button>
      </div>
      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="m-type">Type</Label>
          <Select id="m-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as MemoryType })}>
            {MEMORY_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-title">Title</Label>
          <Input id="m-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-invalid={!!issues?.title} placeholder="e.g. Why I'm watching $AMD" />
          {issues?.title ? <p className="text-xs text-danger">{issues.title[0]}</p> : null}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="m-content">Content</Label>
        <Textarea id="m-content" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} aria-invalid={!!issues?.content} placeholder="Write it the way you'd tell a colleague. Use $TICKERS for assets." />
        {issues?.content ? <p className="text-xs text-danger">{issues.content[0]}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="m-tags">Tags</Label>
          <Input id="m-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="ai, risk" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-url">Source link</Label>
          <Input id="m-url" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} aria-invalid={!!issues?.sourceUrl} placeholder="https://" />
        </div>
      </div>
      {create.error && !issues ? <p className="text-sm text-danger">{create.error.message}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={create.isPending}>{create.isPending ? <Spinner /> : null} Remember</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}

function MemoryDetail({ id, onClose, onSelect }: { id: string; onClose: () => void; onSelect: (id: string) => void }) {
  const qc = useQueryClient();
  const memory = useQuery({ queryKey: ["memory", id], queryFn: () => api<Row>(`/api/memories/${id}`) });
  const related = useQuery({ queryKey: ["related", id], queryFn: () => api<{ memory: Row; matchedBy: string[] }[]>(`/api/memories/${id}/related`) });
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState({ title: "", content: "" });

  const save = useMutation({
    mutationFn: () => api<Row>(`/api/memories/${id}`, { method: "PATCH", body: JSON.stringify(draft) }),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["memory", id] });
      qc.invalidateQueries({ queryKey: ["memories"] });
      qc.invalidateQueries({ queryKey: ["graph"] });
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/api/memories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memories"] });
      qc.invalidateQueries({ queryKey: ["graph"] });
      onClose();
    },
  });

  if (memory.isLoading) return <div className="space-y-3 p-6"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-40" /></div>;
  if (memory.error || !memory.data)
    return (
      <div className="space-y-3 p-6 text-sm">
        <p>This memory no longer exists.</p>
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </div>
    );
  const m = memory.data;

  return (
    <article className="space-y-6 p-6">
      <header className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="eyebrow text-gray">{label(m.type)} · {formatDate(when(m))} · {m.source}</span>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray hover:text-ink"><X className="size-4" /></button>
        </div>
        {editing ? (
          <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-label="Title" />
        ) : (
          <h2 className="text-2xl font-semibold leading-tight tracking-tight">{m.title}</h2>
        )}
      </header>

      {editing ? (
        <div className="space-y-3">
          <Textarea value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} className="min-h-48" aria-label="Content" />
          {save.error ? <p className="text-sm text-danger">{save.error.message}</p> : null}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? <Spinner /> : null} Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{m.content}</p>
      )}

      {m.sourceUrl ? (
        <a href={m.sourceUrl} target="_blank" rel="noreferrer" className="block truncate text-sm text-cobalt underline underline-offset-4">{m.sourceUrl}</a>
      ) : null}
      {m.tags.length ? <div className="flex flex-wrap gap-1">{m.tags.map((t) => <Badge key={t} tone="outline">#{t}</Badge>)}</div> : null}

      <section className="space-y-2">
        <h3 className="eyebrow border-t border-ink pt-2">Linked in your graph</h3>
        {m.entities.length ? (
          <div className="flex flex-wrap gap-1.5">
            {m.entities.map((e) => (
              <Link key={e.id} href={`/app/graph?focus=${e.id}`} className="border border-line px-2 py-1 text-sm hover:border-ink">
                {e.symbol ?? e.name} <span className="eyebrow text-gray">{e.type}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray">No entities recognised. Mention a company, a $TICKER or a theme to connect it.</p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="eyebrow border-t border-ink pt-2">Related memories</h3>
        {related.isLoading ? (
          <Skeleton className="h-20" />
        ) : related.data?.length ? (
          <ul className="divide-y divide-line">
            {related.data.map((r) => (
              <li key={r.memory.id}>
                <button type="button" onClick={() => onSelect(r.memory.id)} className="block w-full py-2 text-left hover:text-cobalt">
                  <span className="block text-sm">{r.memory.title}</span>
                  <span className="eyebrow text-gray">{label(r.memory.type)} · via {r.matchedBy.join(" + ")}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray">Nothing related yet.</p>
        )}
      </section>

      <footer className="flex flex-wrap gap-2 border-t border-line pt-4">
        {!editing ? (
          <Button variant="outline" size="sm" onClick={() => { setDraft({ title: m.title, content: m.content }); setEditing(true); }}>Edit</Button>
        ) : null}
        {confirmDelete ? (
          <>
            <Button variant="danger" size="sm" onClick={() => remove.mutate()} disabled={remove.isPending}>
              {remove.isPending ? <Spinner /> : <Trash2 />} Delete permanently
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Keep it</Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 /> Delete</Button>
        )}
      </footer>
    </article>
  );
}
