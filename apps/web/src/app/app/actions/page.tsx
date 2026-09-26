import Link from "next/link";
import { SectionLabel } from "@jarvis/ui";
import { NewActionForm, SuggestActionsButton } from "@/components/action-forms";
import { ActionStatus } from "@/components/action-status";
import { EmptyState } from "@/components/brand";
import { PageHeader } from "@/components/shell";
import { actionsView } from "@/server/actions";
import { pageUser } from "@/server/auth";
import { services } from "@/server/container";
import { formatDate, money, timeAgo } from "@/lib/format";

export const metadata = { title: "Actions" };

type Row = Awaited<ReturnType<typeof actionsView>>[number];

export default async function ActionsPage() {
  const user = await pageUser();
  const { db } = await services();
  const rows = await actionsView(db, user.id);
  const review = rows.filter((a) => a.approvalStatus === "proposed");
  const ready = rows.filter((a) => a.approvalStatus === "approved" && a.executionStatus === "not_started");
  const history = rows.filter((a) => !review.includes(a) && !ready.includes(a));

  return (
    <>
      <PageHeader
        index="07 — Actions"
        title="Actions"
        description="Trades JARVIS or you proposed. Nothing runs on its own: each one needs your review, a typed confirmation, and a separate submit."
        actions={<SuggestActionsButton />}
      />
      <div className="space-y-14 px-4 pb-20 sm:px-8">
        <section className="space-y-4">
          <SectionLabel index="01" action={<NewActionForm live={user.mode === "live"} />}>Needs your review</SectionLabel>
          {review.length ? <ActionList rows={review} /> : (
            <EmptyState title="Nothing to review" size={96}>
              JARVIS proposes an action when your own goals or theses call for one, for example a position that grew past the cap you set. Ask for proposals, or write your own.
            </EmptyState>
          )}
        </section>
        {ready.length ? (
          <section className="space-y-4">
            <SectionLabel index="02">Approved, not submitted</SectionLabel>
            <ActionList rows={ready} />
          </section>
        ) : null}
        <section className="space-y-4">
          <SectionLabel index={ready.length ? "03" : "02"}>History</SectionLabel>
          {history.length ? <ActionList rows={history} /> : <p className="text-sm text-gray">No decisions yet.</p>}
        </section>
      </div>
    </>
  );
}

function ActionList({ rows }: { rows: Row[] }) {
  return (
    <ol className="divide-y divide-line border-y border-line">
      {rows.map((a) => (
        <li key={a.id}>
          <Link href={`/app/actions/${a.id}`} className="grid gap-2 py-4 hover:bg-surface sm:grid-cols-[180px_1fr_160px] sm:items-baseline sm:px-2">
            <span className="font-mono text-sm font-medium">{a.phrase}</span>
            <span className="line-clamp-2 text-sm text-gray">{a.reasoning}</span>
            <span className="flex items-center gap-2 sm:justify-end">
              <ActionStatus a={a} />
              <span className="eyebrow text-gray">{a.approvalStatus === "proposed" && a.expiresAt ? `lapses ${formatDate(a.expiresAt)}` : timeAgo(a.createdAt)}</span>
            </span>
            <span className="eyebrow text-gray sm:col-span-3">
              {a.proposedBy === "ai" ? "Proposed by JARVIS" : "Your proposal"} · {a.dataMode === "demo" ? "demo, paper" : "live"}
              {a.estimatedPrice ? ` · at ${money(Number(a.estimatedPrice))}` : ""}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
