import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { schema } from "@jarvis/db";
import { Badge, SectionLabel } from "@jarvis/ui";
import { AddWalletForm, ConnectionButtons } from "@/components/action-forms";
import { AuditTable } from "@/components/audit-table";
import { PageHeader } from "@/components/shell";
import { pageUser } from "@/server/auth";
import { listConnections } from "@/server/connections";
import { services } from "@/server/container";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await pageUser();
  const s = await services();
  const rows: [string, string, string][] = [
    ["Language model", s.ai.name === "mock" ? "Offline mode" : `${s.ai.name} · ${s.ai.model}`, "AI_PROVIDER, ANTHROPIC_API_KEY, OPENAI_API_KEY, LOCAL_AI_URL"],
    ["Embeddings", `${s.embedder.name} · ${s.embedder.model} · ${s.embedder.dimensions}d`, "EMBEDDING_PROVIDER"],
    ["Database", s.database.kind === "pglite" ? "Embedded PGlite (local file)" : "PostgreSQL + pgvector", "DATABASE_URL"],
    ["Demo brokerage", `${s.demoBroker.name} · fictional, paper orders only`, "BROKER_PROVIDER"],
    ["Credentials", process.env.JARVIS_ENCRYPTION_KEY ? "Encrypted with AES-256-GCM (configured key)" : "Encrypted with AES-256-GCM (local development key)", "JARVIS_ENCRYPTION_KEY"],
    ["Trading", "Only after your typed approval and a separate submit. JARVIS never executes on its own.", "—"],
    ["Agent scheduler", process.env.CRON_SECRET ? "External scheduler enabled (POST /api/scheduler/run), plus catch-up when you open JARVIS" : "Catch-up when you open JARVIS. Set CRON_SECRET to run agents from cron as well.", "CRON_SECRET"],
  ];
  const [connections, recentAudit] = await Promise.all([
    listConnections(s.db, user.id),
    s.db.select().from(schema.auditLogs).where(eq(schema.auditLogs.userId, user.id)).orderBy(desc(schema.auditLogs.createdAt)).limit(6),
  ]);
  return (
    <>
      <PageHeader index="11 — Settings" title="Settings" description="Which providers this JARVIS instance runs on. Keys are read on the server and never sent to the browser." />
      <div className="space-y-14 px-4 pb-20 sm:px-8">
        <section className="space-y-4">
          <SectionLabel index="01">Account</SectionLabel>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div><dt className="eyebrow text-gray">Email</dt><dd>{user.email}</dd></div>
            <div><dt className="eyebrow text-gray">Name</dt><dd>{user.displayName ?? "—"}</dd></div>
            <div>
              <dt className="eyebrow text-gray">Data</dt>
              <dd><Badge tone={user.mode === "demo" ? "signal" : "ink"}>{user.mode === "demo" ? "Demo, fictional" : "Live"}</Badge></dd>
            </div>
          </dl>
        </section>
        <section className="space-y-4">
          <SectionLabel index="02">Providers</SectionLabel>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <tbody className="divide-y divide-line border-y border-line">
                {rows.map(([k, v, env]) => (
                  <tr key={k}>
                    <th className="eyebrow w-44 py-3 text-left font-normal text-gray">{k}</th>
                    <td className="py-3">{v}</td>
                    <td className="py-3 text-right font-mono text-xs text-gray">{env}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {s.ai.name === "mock" ? (
            <p className="max-w-2xl text-sm text-gray">
              No language model is configured, so answers quote your memory instead of reasoning over it. Set <code className="font-mono">ANTHROPIC_API_KEY</code> or{" "}
              <code className="font-mono">OPENAI_API_KEY</code> in <code className="font-mono">.env</code> and restart.
            </p>
          ) : null}
        </section>

        <section className="space-y-4">
          <SectionLabel index="03">Connections</SectionLabel>
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-3">
              <h3 className="font-medium">Robinhood Chain wallet · read-only</h3>
              <p className="text-sm text-gray">
                Reads the public ETH balance of a wallet through the chain&apos;s public RPC. JARVIS never asks for a private key and cannot move funds.
              </p>
              {user.mode === "demo" ? (
                <p className="text-sm">The demo workspace cannot connect real accounts, so demo and live data never mix.</p>
              ) : (
                <AddWalletForm />
              )}
            </div>
            <div className="space-y-3">
              <h3 className="font-medium">Robinhood Crypto Trading API</h3>
              <p className="text-sm text-gray">
                Not available yet. JARVIS implements Robinhood endpoints only from the official documentation, and this provider has not been built against it. Until then, approved live actions are decision records you carry out yourself.
              </p>
              <Link href="https://docs.robinhood.com/crypto/trading/" className="text-sm text-cobalt hover:underline">Official documentation</Link>
            </div>
          </div>
          {connections.length ? (
            <ul className="divide-y divide-line border-y border-line">
              {connections.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div className="space-y-0.5">
                    <p className="font-medium">{c.label}</p>
                    <p className="eyebrow text-gray">
                      {String(c.metadata.address ?? "")} · {c.status}
                      {c.lastSyncedAt ? ` · synced ${timeAgo(c.lastSyncedAt)}` : " · never synced"}
                    </p>
                    {c.lastError ? <p className="text-xs text-danger">{c.lastError}</p> : null}
                  </div>
                  <ConnectionButtons id={c.id} />
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="space-y-4">
          <SectionLabel index="04" action={<Link href="/app/settings/audit" className="eyebrow text-gray hover:text-cobalt">Full audit log</Link>}>Audit log</SectionLabel>
          <AuditTable rows={recentAudit} />
        </section>
      </div>
    </>
  );
}
