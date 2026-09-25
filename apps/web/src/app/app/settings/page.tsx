import { Badge, SectionLabel } from "@jarvis/ui";
import { PageHeader } from "@/components/shell";
import { pageUser } from "@/server/auth";
import { services } from "@/server/container";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await pageUser();
  const s = await services();
  const rows: [string, string, string][] = [
    ["Language model", s.ai.name === "mock" ? "Offline mode" : `${s.ai.name} · ${s.ai.model}`, "AI_PROVIDER, ANTHROPIC_API_KEY, OPENAI_API_KEY, LOCAL_AI_URL"],
    ["Embeddings", `${s.embedder.name} · ${s.embedder.model} · ${s.embedder.dimensions}d`, "EMBEDDING_PROVIDER"],
    ["Database", s.database.kind === "pglite" ? "Embedded PGlite (local file)" : "PostgreSQL + pgvector", "DATABASE_URL"],
    ["Broker", "Not connected (Phase 3)", "BROKER_PROVIDER"],
    ["Trading", "Disabled. JARVIS never executes actions on its own.", "—"],
  ];
  return (
    <>
      <PageHeader index="09 — Settings" title="Settings" description="Which providers this JARVIS instance runs on. Keys are read on the server and never sent to the browser." />
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
      </div>
    </>
  );
}
