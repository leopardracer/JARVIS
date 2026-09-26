import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SectionLabel } from "@jarvis/ui";
import { CommandBox } from "@/components/ask";
import { EmptyState } from "@/components/brand";
import { GraphPreview } from "@/components/graph-preview";
import { InsightCard } from "@/components/insight-card";
import { pageUser } from "@/server/auth";
import { currentBriefing } from "@/server/briefing";
import { services } from "@/server/container";
import { insightsView, portfolioView } from "@/server/queries";
import { formatDate, label, money, percent, timeAgo } from "@/lib/format";

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const user = await pageUser();
  const svc = await services();
  const { memory, knowledge, db } = svc;
  const [stats, recent, graph, portfolio, insights, activity, briefing] = await Promise.all([
    memory.stats(user.id),
    memory.list(user.id, { limit: 5 }),
    knowledge.graph(user.id),
    portfolioView(db, user.id),
    insightsView(db, user.id, 3),
    memory.recentActivity(user.id, 8),
    currentBriefing(svc, user.id, "weekly"),
  ]);
  const decisions = briefing.sections.find((s) => s.key === "decisions")?.items ?? [];

  return (
    <div className="space-y-14 px-4 pb-20 pt-8 sm:px-8 lg:pt-12">
      <header className="space-y-8">
        <div className="space-y-2">
          <p className="eyebrow text-gray">JARVIS</p>
          <h1 className="display text-[clamp(2.75rem,7vw,6.5rem)] uppercase">
            Your financial <span className="text-cobalt">second brain</span>
          </h1>
        </div>
        <CommandBox
          suggestions={
            stats.memories
              ? ["What could hurt my chip positions?", "Summarize my AMD thesis and the evidence against it", "How much crypto do I hold versus my rule?"]
              : []
          }
        />
      </header>

      <div className="grid grid-cols-1 gap-x-8 gap-y-14 lg:grid-cols-12">
        <section className="space-y-5 lg:col-span-12">
          <SectionLabel index="01" action={<More href="/app/briefing" label="Full briefing" />}>This week</SectionLabel>
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-12">
            <p className="text-balance text-xl font-medium leading-snug tracking-tight sm:text-2xl lg:col-span-7">{briefing.lede}</p>
            {decisions.length ? (
              <ol className="divide-y divide-line border-y border-line lg:col-span-5">
                {decisions.slice(0, 3).map((d, i) => (
                  <li key={i}>
                    <Link href={d.href ?? "/app/briefing"} className="grid grid-cols-[24px_1fr] gap-2 py-2.5 text-sm hover:text-cobalt">
                      <span className="tabular font-mono text-xs text-gray">{String(i + 1).padStart(2, "0")}</span>
                      <span className="font-medium">{d.text}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        </section>

        <section className="space-y-5 lg:col-span-4">
          <SectionLabel index="02" action={<More href="/app/memory" />}>Memory</SectionLabel>
          <dl className="grid grid-cols-3 gap-4">
            {[
              ["Memories", stats.memories],
              ["Entities", stats.entities],
              ["Links", stats.relationships],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="eyebrow text-gray">{k}</dt>
                <dd className="tabular text-4xl font-semibold tracking-tight">{v}</dd>
              </div>
            ))}
          </dl>
          {recent.items.length ? (
            <ol className="divide-y divide-line border-y border-line">
              {recent.items.map((m) => (
                <li key={m.id}>
                  <Link href={`/app/memory?id=${m.id}`} className="block py-2.5 hover:text-cobalt">
                    <span className="block truncate text-sm font-medium">{m.title}</span>
                    <span className="eyebrow text-gray">{label(m.type)} · {formatDate(m.occurredAt ?? m.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-gray">Nothing saved yet. <Link href="/app/memory" className="text-cobalt underline underline-offset-4">Save your first memory.</Link></p>
          )}
        </section>

        <section className="space-y-5 lg:col-span-8">
          <SectionLabel index="03" action={<More href="/app/graph" label="Explore" />}>Knowledge graph</SectionLabel>
          {graph.nodes.length ? (
            <div className="grid gap-4 md:grid-cols-[1fr_180px]">
              <div className="h-80 border border-line bg-white md:h-96">
                <GraphPreview data={graph} />
              </div>
              <ul className="space-y-3">
                {graph.clusters.map((c) => (
                  <li key={c.id} className="border-t border-line pt-2">
                    <Link href={`/app/graph?focus=${c.id}`} className="flex items-baseline justify-between text-sm hover:text-cobalt">
                      {c.label} <span className="tabular text-gray">{c.size}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyState title="No connections yet" size={96}>Save memories that mention companies, $TICKERS or themes and JARVIS will connect them here.</EmptyState>
          )}
        </section>

        <section className="space-y-5 lg:col-span-5">
          <SectionLabel index="04" action={<More href="/app/portfolio" />}>Portfolio</SectionLabel>
          {portfolio ? (
            <div className="space-y-4">
              <div>
                <p className="eyebrow text-gray">Cost basis{portfolio.dataMode === "demo" ? " · demo, illustrative" : ""}</p>
                <p className="tabular text-4xl font-semibold tracking-tight">{money(portfolio.totalCost)}</p>
              </div>
              <ul className="space-y-2.5">
                {portfolio.holdings.map((h) => (
                  <li key={h.id} className="grid grid-cols-[56px_1fr_56px] items-center gap-3 text-sm">
                    <span className="font-mono text-xs">{h.symbol}</span>
                    <span className="h-2 bg-surface">
                      <span className="block h-full bg-cobalt" style={{ width: `${(h.weight ?? 0) * 100}%` }} />
                    </span>
                    <span className="tabular text-right text-gray">{percent(h.weight)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-gray">No portfolio yet. Connect a Robinhood Chain wallet in Settings; until then JARVIS works from your notes.</p>
          )}
        </section>

        <section className="space-y-5 lg:col-span-7">
          <SectionLabel index="05" action={<More href="/app/insights" />}>Recent insights</SectionLabel>
          {insights.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {insights.slice(0, 2).map((i) => <InsightCard key={i.id} insight={i} compact />)}
            </div>
          ) : (
            <p className="text-sm text-gray">No insights yet. They appear when JARVIS spots a change, a contradiction or a risk across your memories.</p>
          )}
        </section>

        <section className="space-y-5 lg:col-span-12">
          <SectionLabel index="06" action={<More href="/app/activity" />}>Recent activity</SectionLabel>
          {activity.length ? (
            <ol className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              {activity.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-4 border-b border-line py-2 text-sm">
                  <span className="truncate">{a.summary}</span>
                  <span className="eyebrow shrink-0 text-gray">{timeAgo(a.createdAt)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-gray">Nothing yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function More({ href, label = "View all" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="eyebrow flex items-center gap-1 text-gray hover:text-cobalt">
      {label} <ArrowUpRight className="size-3" />
    </Link>
  );
}
