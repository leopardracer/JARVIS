"use client";

import { useState } from "react";
import { Pause, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button, Input, Label, Select, Spinner } from "@jarvis/ui";
import { api, ApiError } from "@/lib/api";
import { useServerAction } from "./actions";

export function NewAgentForm({ suggestions = [] }: { suggestions?: string[] }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [issues, setIssues] = useState<Record<string, string[]>>({});
  const { run, busy, error } = useServerAction();

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus /> New agent
      </Button>
    );
  }
  return (
    <form
      className="grid gap-4 border border-ink p-5 sm:grid-cols-[1fr_160px]"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        setIssues({});
        const ok = await run(async () => {
          try {
            return await api("/api/agents", { method: "POST", body: JSON.stringify({ name: f.get("name"), question, cadence: f.get("cadence") }) });
          } catch (err) {
            if (err instanceof ApiError && err.issues) setIssues(err.issues);
            throw err;
          }
        });
        if (ok) {
          setOpen(false);
          setQuestion("");
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="ag-name">Name</Label>
        <Input id="ag-name" name="name" required maxLength={80} placeholder="Export-rule watch" aria-invalid={!!issues.name} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ag-cadence">Runs</Label>
        <Select id="ag-cadence" name="cadence" defaultValue="weekly">
          <option value="daily">Every day</option>
          <option value="weekly">Every week</option>
        </Select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="ag-question">Question it asks your memory</Label>
        <Input id="ag-question" value={question} onChange={(e) => setQuestion(e.target.value)} required maxLength={500} aria-invalid={!!issues.question} />
        {suggestions.length ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => setQuestion(s)} className="border border-line px-2 py-1 text-xs text-gray hover:border-ink hover:text-ink">
                {s}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {Object.values(issues)[0] ? <p className="text-sm text-danger sm:col-span-2">{Object.values(issues)[0][0]}</p> : null}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={busy}>{busy ? <Spinner /> : null} Save agent</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        {error ? <span className="text-sm text-danger">{error}</span> : null}
        <span className="text-xs text-gray">It first runs on the next pass, then on its schedule. It reads only your memory.</span>
      </div>
    </form>
  );
}

export function AgentControls({ id, name, enabled }: { id: string; name: string; enabled: boolean }) {
  const { run, busy, error } = useServerAction();
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex gap-1">
        <Button size="sm" variant="outline" disabled={busy || !enabled} onClick={() => run(() => api(`/api/agents/${id}/run`, { method: "POST" }))}>
          {busy ? <Spinner /> : <RefreshCw />} Run now
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          aria-label={enabled ? `Pause ${name}` : `Resume ${name}`}
          onClick={() => run(() => api(`/api/agents/${id}`, { method: "PATCH", body: JSON.stringify({ enabled: !enabled }) }))}
        >
          {enabled ? <Pause /> : <Play />}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} aria-label={`Remove ${name}`} onClick={() => run(() => api(`/api/agents/${id}`, { method: "DELETE" }))}>
          <Trash2 />
        </Button>
      </div>
      {error ? <span className="max-w-64 text-xs text-danger">{error}</span> : null}
    </div>
  );
}

export function RefreshBriefingButton({ period }: { period: "daily" | "weekly" }) {
  const { run, busy, error } = useServerAction();
  return (
    <div className="flex flex-col items-start gap-1 md:items-end">
      <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => api("/api/briefing", { method: "POST", body: JSON.stringify({ period }) }))}>
        {busy ? <Spinner /> : <RefreshCw />} Rebuild
      </Button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
