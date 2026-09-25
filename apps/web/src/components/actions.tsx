"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import { Button, cn, Spinner } from "@jarvis/ui";
import { api, ApiError } from "@/lib/api";

/** Run an API call, then re-render the server page with fresh data. */
export function useServerAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      startTransition(() => router.refresh());
      return result;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return { run, busy: busy || pending, error };
}

export function RunInsightsButton() {
  const { run, busy, error } = useServerAction();
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={async () => {
          const r = await run(() => api<{ found: number; created: unknown[] }>("/api/insights/run", { method: "POST" }));
          if (r) setNote(r.created.length ? `${r.created.length} new` : "Nothing new");
        }}
      >
        {busy ? <Spinner /> : <RefreshCw />} Check for changes
      </Button>
      {error ? <span className="text-xs text-danger">{error}</span> : note ? <span className="eyebrow text-gray">{note}</span> : null}
    </div>
  );
}

export function InsightStatusButtons({ id, status }: { id: string; status: string }) {
  const { run, busy } = useServerAction();
  const set = (next: string) => run(() => api(`/api/insights/${id}`, { method: "PATCH", body: JSON.stringify({ status: next }) }));
  if (status === "dismissed") {
    return (
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => set("seen")}>
        Restore
      </Button>
    );
  }
  return (
    <div className={cn("flex gap-1", busy && "opacity-50")}>
      {status === "new" ? (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => set("seen")} aria-label="Mark as seen">
          <Check /> Seen
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => set("dismissed")} aria-label="Dismiss insight">
        <X /> Dismiss
      </Button>
    </div>
  );
}

export function SyncButton({ label = "Sync" }: { label?: string }) {
  const { run, busy, error } = useServerAction();
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={async () => {
          const r = await run(() => api<{ added: number }>("/api/portfolio/sync", { method: "POST" }));
          if (r) setNote(r.added ? `${r.added} new transactions` : "Up to date");
        }}
      >
        {busy ? <Spinner /> : <RefreshCw />} {label}
      </Button>
      {error ? <span className="text-xs text-danger">{error}</span> : note ? <span className="eyebrow text-gray">{note}</span> : null}
    </div>
  );
}
