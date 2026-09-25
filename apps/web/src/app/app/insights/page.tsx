import Link from "next/link";
import { INSIGHT_KINDS } from "@jarvis/knowledge";
import { cn } from "@jarvis/ui";
import { InsightStatusButtons, RunInsightsButton } from "@/components/actions";
import { EmptyState } from "@/components/brand";
import { InsightCard } from "@/components/insight-card";
import { PageHeader } from "@/components/shell";
import { pageUser } from "@/server/auth";
import { services } from "@/server/container";
import { insightsView } from "@/server/queries";
import { label } from "@/lib/format";

export const metadata = { title: "Insights" };

type Props = { searchParams: Promise<{ kind?: string; view?: string }> };

export default async function InsightsPage({ searchParams }: Props) {
  const { kind: rawKind, view } = await searchParams;
  const kind = INSIGHT_KINDS.find((k) => k === rawKind);
  const dismissed = view === "dismissed";
  const user = await pageUser();
  const { db } = await services();
  const insights = await insightsView(db, user.id, 60, { kind, dismissed });
  const href = (k?: string, v?: string) => {
    const sp = new URLSearchParams();
    if (k) sp.set("kind", k);
    if (v) sp.set("view", v);
    return `/app/insights${sp.size ? `?${sp}` : ""}`;
  };

  return (
    <>
      <PageHeader
        index="06 — Insights"
        title="Insights"
        description="What changed, why it matters, and the memories that show it. Each insight is computed from your own memory, graph and trades, never from market data it cannot source."
        actions={<RunInsightsButton />}
      />
      <div className="space-y-6 px-4 pb-20 sm:px-8">
        <nav className="flex flex-wrap gap-2" aria-label="Filter insights">
          {[undefined, ...INSIGHT_KINDS].map((k) => (
            <Link
              key={k ?? "all"}
              href={href(k, view)}
              className={cn("eyebrow border px-2.5 py-1", kind === k ? "border-ink bg-ink text-white" : "border-line text-gray hover:border-ink hover:text-ink")}
            >
              {k ? label(k) : "All"}
            </Link>
          ))}
          <Link href={href(kind, dismissed ? undefined : "dismissed")} className="eyebrow ml-auto px-2.5 py-1 text-gray hover:text-ink">
            {dismissed ? "Show active" : "Show dismissed"}
          </Link>
        </nav>
        {insights.length === 0 ? (
          <EmptyState title={dismissed ? "Nothing dismissed" : "No insights here yet"}>
            JARVIS raises an insight when your memory shows a thesis under pressure, a contradiction, a new connection, a topic you keep returning to, or a shift in what your portfolio is exposed to.
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {insights.map((i) => <InsightCard key={i.id} insight={i} actions={<InsightStatusButtons id={i.id} status={i.status} />} />)}
          </div>
        )}
      </div>
    </>
  );
}
