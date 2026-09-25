"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Core } from "cytoscape";
import { Crosshair, Maximize2, Minus, Pause, Play, Plus, Sparkles, X } from "lucide-react";
import type { EntityDetails, EntityType, GraphData } from "@jarvis/types";
import { Badge, Button, cn, Input, Skeleton, Spinner } from "@jarvis/ui";
import { api } from "@/lib/api";
import { formatDate, formatShortDate, label } from "@/lib/format";
import { TYPE_COLOR } from "@/lib/graph-style";
import { EmptyState } from "./brand";
import { GraphCanvas } from "./graph-canvas";

type Details = EntityDetails & { neighborhood: GraphData };

export function GraphExplorer() {
  const params = useSearchParams();
  const router = useRouter();
  const graph = useQuery({ queryKey: ["graph"], queryFn: () => api<GraphData>("/api/graph") });

  const [selected, setSelected] = useState<string | null>(params.get("focus"));
  const [focus, setFocus] = useState<{ id: string; depth: number } | null>(params.get("focus") ? { id: params.get("focus")!, depth: 1 } : null);
  const [q, setQ] = useState("");
  const [hiddenTypes, setHiddenTypes] = useState<Set<EntityType>>(new Set());
  const [clusters, setClusters] = useState(true);
  const [timeline, setTimeline] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const cy = useRef<Core | null>(null);

  const data = graph.data;
  const types = useMemo(() => [...new Set(data?.nodes.map((n) => n.type) ?? [])].sort(), [data]);

  const range = useMemo(() => {
    if (!data?.nodes.length) return null;
    const times = [...data.nodes.map((n) => n.firstSeen), ...data.edges.map((e) => e.createdAt)].map((t) => new Date(t).getTime());
    return { min: Math.min(...times), max: Math.max(...times) };
  }, [data]);

  // Timeline playback: sweep from the first memory to today.
  useEffect(() => {
    if (!playing || !range) return;
    const step = (range.max - range.min) / 60;
    const t = setInterval(() => {
      setTimeline((cur) => {
        const next = (cur ?? range.min) + step;
        if (next >= range.max) {
          setPlaying(false);
          return range.max;
        }
        return next;
      });
    }, 80);
    return () => clearInterval(t);
  }, [playing, range]);

  const { visible, visibleEdges } = useMemo(() => {
    if (!data) return { visible: null, visibleEdges: null };
    let ids = new Set(data.nodes.filter((n) => !hiddenTypes.has(n.type)).map((n) => n.id));
    if (timeline !== null) {
      ids = new Set([...ids].filter((id) => new Date(data.nodes.find((n) => n.id === id)!.firstSeen).getTime() <= timeline));
    }
    if (focus) {
      const keep = new Set([focus.id]);
      let frontier = [focus.id];
      for (let d = 0; d < focus.depth; d++) {
        const next: string[] = [];
        for (const e of data.edges) {
          for (const [a, b] of [[e.source, e.target], [e.target, e.source]]) {
            if (frontier.includes(a) && !keep.has(b) && ids.has(b)) {
              keep.add(b);
              next.push(b);
            }
          }
        }
        frontier = next;
      }
      ids = new Set([...ids].filter((id) => keep.has(id)));
    }
    const edges = new Set(
      data.edges
        .filter((e) => ids.has(e.source) && ids.has(e.target) && (timeline === null || new Date(e.createdAt).getTime() <= timeline))
        .map((e) => e.id),
    );
    const filtered = hiddenTypes.size > 0 || timeline !== null || focus !== null;
    return { visible: filtered ? ids : null, visibleEdges: filtered ? edges : null };
  }, [data, hiddenTypes, timeline, focus]);

  const highlight = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s || !data) return null;
    return new Set(data.nodes.filter((n) => n.label.toLowerCase().includes(s) || n.symbol?.toLowerCase() === s).map((n) => n.id));
  }, [q, data]);

  function select(id: string | null) {
    setSelected(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("focus", id);
    else url.searchParams.delete("focus");
    router.replace(url.pathname + url.search, { scroll: false });
  }

  if (graph.isLoading) return <Skeleton className="m-4 h-[70vh] sm:m-8" />;
  if (graph.error) return <p className="px-8 text-sm text-danger">Could not load the graph: {(graph.error as Error).message}</p>;
  if (!data?.nodes.length)
    return (
      <div className="px-4 sm:px-8">
        <EmptyState title="Your graph is empty" action={<Link href="/app/memory" className="text-sm text-cobalt underline underline-offset-4">Save your first memory</Link>}>
          Every note, thesis or trade you save adds companies, assets and themes here, connected by how they relate.
        </EmptyState>
      </div>
    );

  const shownCount = visible ? visible.size : data.nodes.length;

  return (
    <div className="grid border-t border-line lg:h-[calc(100dvh-16rem)] lg:min-h-[560px] lg:grid-cols-[1fr_360px]">
      <section className="relative flex min-h-[70vh] flex-col lg:min-h-0">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 sm:px-8">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search entities…"
            aria-label="Search the graph"
            className="h-8 w-48"
            onKeyDown={(e) => {
              if (e.key === "Enter" && highlight?.size) select([...highlight][0]);
            }}
          />
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by type">
            {types.map((t) => {
              const off = hiddenTypes.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={!off}
                  onClick={() =>
                    setHiddenTypes((s) => {
                      const next = new Set(s);
                      if (off) next.delete(t);
                      else next.add(t);
                      return next;
                    })
                  }
                  className={cn("eyebrow flex items-center gap-1.5 border px-2 py-1", off ? "border-line text-gray line-through" : "border-ink text-ink")}
                >
                  <span className="size-2" style={{ background: TYPE_COLOR[t] }} />
                  {t}
                </button>
              );
            })}
          </div>
          <label className="eyebrow ml-auto flex items-center gap-2 text-gray">
            <input type="checkbox" checked={clusters} onChange={(e) => setClusters(e.target.checked)} className="accent-cobalt" />
            Clusters
          </label>
        </div>

        {/* Canvas */}
        <div className="relative flex-1">
          <div className="absolute inset-0">
          <GraphCanvas
            data={data}
            clusters={clusters}
            visible={visible}
            visibleEdges={visibleEdges}
            selected={selected}
            highlight={highlight}
            onSelect={select}
            onReady={(c) => (cy.current = c)}
            className="h-full w-full"
          />
          </div>
          <div className="absolute right-3 top-3 flex flex-col border border-line bg-white">
            <Button variant="ghost" size="icon" aria-label="Zoom in" onClick={() => cy.current?.zoom({ level: cy.current.zoom() * 1.25, renderedPosition: { x: cy.current.width() / 2, y: cy.current.height() / 2 } })}>
              <Plus />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Zoom out" onClick={() => cy.current?.zoom({ level: cy.current.zoom() / 1.25, renderedPosition: { x: cy.current.width() / 2, y: cy.current.height() / 2 } })}>
              <Minus />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Fit to screen" onClick={() => cy.current?.animate({ fit: { eles: cy.current.elements(":visible"), padding: 30 } }, { duration: 250 })}>
              <Maximize2 />
            </Button>
          </div>
          {focus ? (
            <div className="absolute left-3 top-3 flex items-center gap-2 border border-ink bg-white px-3 py-1.5 text-xs">
              <Crosshair className="size-3.5 text-cobalt" />
              Focus: {data.nodes.find((n) => n.id === focus.id)?.label}
              <select
                value={focus.depth}
                onChange={(e) => setFocus({ ...focus, depth: Number(e.target.value) })}
                className="border border-line px-1"
                aria-label="Focus depth"
              >
                <option value={1}>1 hop</option>
                <option value={2}>2 hops</option>
                <option value={3}>3 hops</option>
              </select>
              <button type="button" onClick={() => setFocus(null)} aria-label="Exit focus mode" className="text-gray hover:text-ink">
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}
          <div className="eyebrow absolute bottom-3 left-4 text-gray sm:left-8">
            {shownCount} nodes · {visibleEdges ? visibleEdges.size : data.edges.length} links · {data.clusters.length} clusters
          </div>
        </div>

        {/* Timeline */}
        {range ? (
          <div className="flex items-center gap-3 border-t border-line px-4 py-2 sm:px-8">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label={playing ? "Pause timeline" : "Play timeline"}
              onClick={() => {
                if (!playing && (timeline === null || timeline >= range.max)) setTimeline(range.min);
                setPlaying(!playing);
              }}
            >
              {playing ? <Pause /> : <Play />}
            </Button>
            <span className="eyebrow w-24 shrink-0 text-gray">Timeline</span>
            <input
              type="range"
              min={range.min}
              max={range.max}
              value={timeline ?? range.max}
              onChange={(e) => {
                setPlaying(false);
                setTimeline(Number(e.target.value));
              }}
              aria-label="Show the graph as of this date"
              className="flex-1 accent-cobalt"
            />
            <span className="eyebrow w-28 shrink-0 text-right tabular">{timeline === null ? "Today" : formatShortDate(new Date(timeline))}</span>
            {timeline !== null ? (
              <button type="button" className="eyebrow text-gray hover:text-ink" onClick={() => { setPlaying(false); setTimeline(null); }}>
                Reset
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <aside className="border-t border-line lg:overflow-y-auto lg:border-l lg:border-t-0">
        {selected ? (
          <EntityPanel id={selected} onClose={() => select(null)} onFocus={(id) => setFocus({ id, depth: 1 })} onSelect={select} />
        ) : (
          <GraphLegend data={data} onSelect={select} />
        )}
      </aside>
    </div>
  );
}

function GraphLegend({ data, onSelect }: { data: GraphData; onSelect: (id: string) => void }) {
  const top = [...data.nodes].filter((n) => n.type !== "theme").sort((a, b) => b.degree - a.degree).slice(0, 8);
  return (
    <div className="space-y-8 p-5">
      <p className="text-sm leading-relaxed text-gray">
        Select a node to see what JARVIS knows about it. Scroll to zoom, drag to pan, and use the timeline to watch your graph grow.
      </p>
      <section className="space-y-2">
        <h3 className="eyebrow border-t border-ink pt-2">Clusters</h3>
        <ul className="divide-y divide-line">
          {data.clusters.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onSelect(c.id)} className="flex w-full justify-between py-2 text-sm hover:text-cobalt">
                {c.label} <span className="tabular text-gray">{c.size}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2">
        <h3 className="eyebrow border-t border-ink pt-2">Most connected</h3>
        <ul className="divide-y divide-line">
          {top.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => onSelect(n.id)} className="flex w-full items-center gap-2 py-2 text-left text-sm hover:text-cobalt">
                <span className="size-2 shrink-0" style={{ background: TYPE_COLOR[n.type] }} />
                <span className="flex-1 truncate">{n.label}</span>
                <span className="tabular text-gray">{n.degree}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function EntityPanel({ id, onClose, onFocus, onSelect }: { id: string; onClose: () => void; onFocus: (id: string) => void; onSelect: (id: string) => void }) {
  const details = useQuery({ queryKey: ["entity", id], queryFn: () => api<Details>(`/api/graph/entities/${id}`) });
  const summary = useQuery({
    queryKey: ["entity-summary", id],
    queryFn: () => api<{ text: string; offline: boolean }>(`/api/graph/entities/${id}/summary`, { method: "POST" }),
    staleTime: 5 * 60_000,
  });

  if (details.isLoading)
    return (
      <div className="space-y-3 p-5">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-20" />
        <Skeleton className="h-40" />
      </div>
    );
  if (details.error || !details.data)
    return (
      <div className="space-y-3 p-5 text-sm">
        <p className="text-danger">This entity could not be loaded.</p>
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </div>
    );

  const d = details.data;
  const e = d.entity;
  return (
    <div className="space-y-7 p-5">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <Badge tone="outline">
            <span className="size-1.5" style={{ background: TYPE_COLOR[e.type] }} />
            {e.type}
          </Badge>
          <button type="button" onClick={onClose} aria-label="Close details" className="text-gray hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
        <h2 className="text-3xl font-semibold leading-tight tracking-tight">
          {e.name}
          {e.symbol && e.symbol !== e.name ? <span className="ml-2 font-mono text-base text-gray">{e.symbol}</span> : null}
        </h2>
        {e.description ? <p className="text-sm text-gray">{e.description}</p> : null}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onFocus(e.id)}>
            <Crosshair /> Focus
          </Button>
          <Link href={`/app/memory?entity=${e.id}`} className="inline-flex h-8 items-center border border-line px-3 text-xs hover:border-ink">
            Memories
          </Link>
        </div>
      </header>

      <section className="space-y-2 bg-cobalt-tint p-4">
        <h3 className="eyebrow flex items-center gap-1.5 text-cobalt">
          <Sparkles className="size-3" /> {summary.data?.offline ? "Summary (offline)" : "AI summary"}
        </h3>
        {summary.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-gray"><Spinner className="size-3" /> Reading your memory</p>
        ) : summary.error ? (
          <p className="text-sm text-gray">Summary unavailable right now.</p>
        ) : (
          <p className="text-sm leading-relaxed">{summary.data?.text}</p>
        )}
      </section>

      <RefList title="Related assets" items={d.relatedAssets} onSelect={onSelect} />
      <RefList title="Events" items={d.relatedEvents} onSelect={onSelect} />
      <RefList title="Trades" items={d.relatedTrades} onSelect={onSelect} />

      <section className="space-y-2">
        <h3 className="eyebrow border-t border-ink pt-2">Memories · {d.memories.length}</h3>
        {d.memories.length === 0 ? (
          <p className="text-sm text-gray">No memories mention this yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {d.memories.slice(0, 8).map((m) => (
              <li key={m.id}>
                <Link href={`/app/memory?id=${m.id}`} className="block py-2 hover:text-cobalt">
                  <span className="block text-sm">{m.title}</span>
                  <span className="eyebrow text-gray">{label(m.type)} · {formatDate(m.occurredAt ?? m.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="eyebrow border-t border-ink pt-2">Connections · {d.neighbors.length}</h3>
        <ul className="divide-y divide-line">
          {d.neighbors.slice(0, 16).map((n, i) => (
            <li key={`${n.id}-${n.relation}-${i}`}>
              <button type="button" onClick={() => onSelect(n.id)} className="flex w-full items-baseline gap-2 py-1.5 text-left text-sm hover:text-cobalt">
                <span className="eyebrow w-24 shrink-0 text-gray">{n.direction === "out" ? "" : "← "}{label(n.relation)}</span>
                <span className="truncate">{n.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function RefList({ title, items, onSelect }: { title: string; items: { id: string; name: string; symbol: string | null }[]; onSelect: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="eyebrow border-t border-ink pt-2">{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {items.map((a) => (
          <button key={a.id} type="button" onClick={() => onSelect(a.id)} className="border border-line px-2 py-1 text-sm hover:border-ink">
            {a.symbol ?? a.name}
          </button>
        ))}
      </div>
    </section>
  );
}
