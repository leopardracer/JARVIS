"use client";

import Link from "next/link";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Input, Spinner } from "@jarvis/ui";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useServerAction } from "./actions";

export type WatchItem = {
  assetId: string;
  symbol: string | null;
  name: string;
  description: string | null;
  note: string | null;
  mentions: number;
  lastMentioned: string | null;
  held: boolean;
  theses: { id: string; title: string; stance: string; conviction: number }[];
};

export function AddToWatchlist() {
  const { run, busy, error } = useServerAction();
  const [issue, setIssue] = useState<string | null>(null);
  return (
    <form
      className="grid gap-2 sm:grid-cols-[140px_1fr_auto]"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        setIssue(null);
        const ok = await run(async () => {
          try {
            return await api("/api/watchlist", { method: "POST", body: JSON.stringify({ symbol: f.get("symbol"), note: f.get("note") || undefined }) });
          } catch (err) {
            if (err instanceof ApiError && err.issues?.symbol) setIssue(err.issues.symbol[0]);
            throw err;
          }
        });
        if (ok) form.reset();
      }}
    >
      <Input name="symbol" placeholder="Ticker" aria-label="Ticker" required maxLength={12} aria-invalid={!!issue} className="font-mono uppercase" />
      <Input name="note" placeholder="What are you watching it for?" aria-label="Note" maxLength={500} />
      <Button type="submit" disabled={busy}>{busy ? <Spinner /> : <Plus />} Watch</Button>
      {issue || error ? <p className="text-sm text-danger sm:col-span-3">{issue ?? error}</p> : null}
    </form>
  );
}

export function WatchCard({ item }: { item: WatchItem }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(item.note ?? "");
  const { run, busy } = useServerAction();

  return (
    <li className="flex h-full flex-col gap-3 bg-white p-5">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/app/graph?focus=${item.assetId}`} className="font-mono text-3xl font-medium tracking-tight hover:text-cobalt">
          {item.symbol ?? item.name}
        </Link>
        <div className="flex items-center gap-1">
          {item.held ? <Badge tone="ink">Held</Badge> : null}
          <button type="button" aria-label={`Edit note for ${item.symbol}`} onClick={() => setEditing((v) => !v)} className="p-1 text-gray hover:text-ink">
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Stop watching ${item.symbol}`}
            disabled={busy}
            onClick={() => run(() => api(`/api/watchlist/${item.assetId}`, { method: "DELETE" }))}
            className="p-1 text-gray hover:text-danger"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
      {item.description ? <p className="text-sm text-gray">{item.description}</p> : null}
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="eyebrow text-gray">Mentions</dt>
          <dd className="tabular">
            <Link href={`/app/memory?entity=${item.assetId}`} className="hover:text-cobalt">{item.mentions}</Link>
          </dd>
        </div>
        <div>
          <dt className="eyebrow text-gray">Last noted</dt>
          <dd>{item.lastMentioned ? formatDate(item.lastMentioned) : "—"}</dd>
        </div>
      </dl>
      {item.theses.length ? (
        <ul className="space-y-1 text-sm">
          {item.theses.map((t) => (
            <li key={t.id}>
              <Link href={`/app/research/theses/${t.id}`} className="line-clamp-1 hover:text-cobalt">
                <span className={t.stance === "bearish" ? "text-danger" : "text-cobalt"}>{t.stance}</span> · {t.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {editing ? (
        <form
          className="mt-auto flex gap-2 border-t border-line pt-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(() => api(`/api/watchlist/${item.assetId}`, { method: "PATCH", body: JSON.stringify({ note: note || null }) }));
            if (r) setEditing(false);
          }}
        >
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} aria-label="Note" className="h-8" autoFocus />
          <Button type="submit" size="sm" disabled={busy}>Save</Button>
        </form>
      ) : item.note ? (
        <p className="mt-auto border-t border-line pt-3 text-sm">{item.note}</p>
      ) : null}
    </li>
  );
}
