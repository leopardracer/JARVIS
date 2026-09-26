"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { Button, Input, Label, Select, Spinner, Textarea } from "@jarvis/ui";
import { api, ApiError } from "@/lib/api";
import { useServerAction } from "./actions";

export function SuggestActionsButton() {
  const { run, busy, error } = useServerAction();
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={async () => {
          const r = await run(() => api<{ created: unknown[] }>("/api/actions/suggest", { method: "POST" }));
          if (r) setNote(r.created.length ? `${r.created.length} new proposal${r.created.length === 1 ? "" : "s"}` : "Nothing to propose");
        }}
      >
        {busy ? <Spinner /> : <Sparkles />} Ask JARVIS for proposals
      </Button>
      {error ? <span className="text-xs text-danger">{error}</span> : note ? <span className="eyebrow text-gray">{note}</span> : null}
    </div>
  );
}

export function NewActionForm({ live }: { live: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [issues, setIssues] = useState<Record<string, string[]>>({});
  const { run, busy, error } = useServerAction();

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus /> New proposal
      </Button>
    );
  }
  return (
    <form
      className="grid gap-4 border border-ink p-5 sm:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setIssues({});
        const row = await run(async () => {
          try {
            return await api<{ id: string }>("/api/actions", {
              method: "POST",
              body: JSON.stringify({ side: f.get("side"), symbol: f.get("symbol"), quantity: f.get("quantity"), price: f.get("price") || null, reasoning: f.get("reasoning") }),
            });
          } catch (err) {
            if (err instanceof ApiError && err.issues) setIssues(err.issues);
            throw err;
          }
        });
        if (row) router.push(`/app/actions/${row.id}`);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="a-side">Side</Label>
        <Select id="a-side" name="side" defaultValue="buy">
          <option value="buy">Buy</option>
          <option value="sell">Sell</option>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="a-symbol">Ticker</Label>
        <Input id="a-symbol" name="symbol" required maxLength={12} className="font-mono uppercase" aria-invalid={!!issues.symbol} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="a-qty">Quantity</Label>
        <Input id="a-qty" name="quantity" required inputMode="decimal" aria-invalid={!!issues.quantity} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="a-price">{live ? "Limit price (optional)" : "Price for the paper fill"}</Label>
        <Input id="a-price" name="price" inputMode="decimal" aria-invalid={!!issues.price} />
      </div>
      <div className="space-y-1.5 sm:col-span-4">
        <Label htmlFor="a-why">Why</Label>
        <Textarea id="a-why" name="reasoning" required maxLength={4000} className="min-h-20" aria-invalid={!!issues.reasoning} />
      </div>
      {Object.values(issues)[0] ? <p className="text-sm text-danger sm:col-span-4">{Object.values(issues)[0][0]}</p> : null}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-4">
        <Button type="submit" disabled={busy}>{busy ? <Spinner /> : null} Save proposal</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        {error ? <span className="text-sm text-danger">{error}</span> : null}
        <span className="text-xs text-gray">A proposal is only a draft. It still needs your review and confirmation.</span>
      </div>
    </form>
  );
}

export function ApproveForm({ id, phrase }: { id: string; phrase: string }) {
  const [typed, setTyped] = useState("");
  const { run, busy, error } = useServerAction();
  const matches = typed.trim().replace(/\s+/g, " ").toUpperCase() === phrase;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (matches) run(() => api(`/api/actions/${id}/approve`, { method: "POST", body: JSON.stringify({ phrase: typed }) }));
      }}
    >
      <Label htmlFor="confirm">
        Type <span className="font-mono text-ink">{phrase}</span> to approve
      </Label>
      <Input id="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} className="font-mono uppercase" />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!matches || busy}>{busy ? <Spinner /> : null} Approve</Button>
        <RejectButton id={id} />
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </form>
  );
}

export function RejectButton({ id }: { id: string }) {
  const { run, busy } = useServerAction();
  return (
    <Button variant="danger" disabled={busy} onClick={() => run(() => api(`/api/actions/${id}/reject`, { method: "POST", body: JSON.stringify({}) }))}>
      Reject
    </Button>
  );
}

export function ExecuteForm({ id, target }: { id: string; target: string }) {
  const [sure, setSure] = useState(false);
  const { run, busy, error } = useServerAction();
  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-1 accent-[var(--color-cobalt)]" />
        <span>I want to submit this order to {target} now.</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!sure || busy} onClick={() => run(() => api(`/api/actions/${id}/execute`, { method: "POST" }))}>
          {busy ? <Spinner /> : null} Submit order
        </Button>
        <RejectButton id={id} />
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

export function AddWalletForm() {
  const [issue, setIssue] = useState<string | null>(null);
  const { run, busy, error } = useServerAction();
  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_140px_auto]"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        setIssue(null);
        const ok = await run(async () => {
          try {
            return await api("/api/connections", { method: "POST", body: JSON.stringify({ address: f.get("address"), network: f.get("network") }) });
          } catch (err) {
            if (err instanceof ApiError && err.issues?.address) setIssue(err.issues.address[0]);
            throw err;
          }
        });
        if (ok) form.reset();
      }}
    >
      <Input name="address" placeholder="0x… wallet address" aria-label="Wallet address" required className="font-mono" aria-invalid={!!issue} />
      <Select name="network" aria-label="Network" defaultValue="mainnet">
        <option value="mainnet">Mainnet</option>
        <option value="testnet">Testnet</option>
      </Select>
      <Button type="submit" disabled={busy}>{busy ? <Spinner /> : <Plus />} Connect</Button>
      {issue || error ? <p className="text-sm text-danger sm:col-span-3">{issue ?? error}</p> : null}
    </form>
  );
}

export function ConnectionButtons({ id }: { id: string }) {
  const { run, busy, error } = useServerAction();
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => api(`/api/connections/${id}/sync`, { method: "POST" }))}>
          {busy ? <Spinner /> : <RefreshCw />} Sync
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} aria-label="Disconnect" onClick={() => run(() => api(`/api/connections/${id}`, { method: "DELETE" }))}>
          <Trash2 />
        </Button>
      </div>
      {error ? <span className="max-w-64 text-right text-xs text-danger">{error}</span> : null}
    </div>
  );
}
