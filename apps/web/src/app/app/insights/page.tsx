import { EmptyState, Mascot } from "@/components/brand";
import { InsightCard } from "@/components/insight-card";
import { PageHeader } from "@/components/shell";
import { pageUser } from "@/server/auth";
import { services } from "@/server/container";
import { insightsView } from "@/server/queries";

export const metadata = { title: "Insights" };

export default async function InsightsPage() {
  const user = await pageUser();
  const { db } = await services();
  const insights = await insightsView(db, user.id);
  return (
    <>
      <PageHeader
        index="06 — Insights"
        title="Insights"
        description="What changed, why it matters, and the memories that show it. Each insight cites its evidence."
        actions={<Mascot size={88} className="hidden md:block" />}
      />
      <div className="px-4 pb-20 sm:px-8">
        {insights.length === 0 ? (
          <EmptyState title="No insights yet">JARVIS surfaces an insight when your memories reveal a change, a contradiction or a concentration you should know about.</EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {insights.map((i) => <InsightCard key={i.id} insight={i} />)}
          </div>
        )}
      </div>
    </>
  );
}
