import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { SectionLabel } from "@jarvis/ui";
import { InsightCard } from "@/components/insight-card";
import { PageHeader } from "@/components/shell";
import { EvidenceLinker, RemoveEvidence, StanceBadge, ThesisControls } from "@/components/thesis-forms";
import { pageUser } from "@/server/auth";
import { services } from "@/server/container";
import { insightsView } from "@/server/queries";
import { thesisDetail } from "@/server/theses";
import { formatDate, label } from "@/lib/format";

export const metadata = { title: "Thesis" };

type Props = { params: Promise<{ id: string }> };

export default async function ThesisPage({ params }: Props) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const user = await pageUser();
  const { db } = await services();
  const t = await thesisDetail(db, user.id, id.data);
  if (!t) notFound();
  const evidenceIds = [t.origin?.memoryId, ...t.supporting.map((e) => e.memoryId), ...t.contradicting.map((e) => e.memoryId)].filter((x): x is string => !!x);
  const related = (await insightsView(db, user.id, 40)).filter((i) => i.memoryIds.some((m) => evidenceIds.includes(m)) || i.entityIds.some((e) => t.assets.some((a) => a.id === e)));

  return (
    <>
      <PageHeader
        index="05 — Research / Thesis"
        title={t.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StanceBadge stance={t.stance} />
            <span className="eyebrow text-gray">{t.status === "active" ? `Conviction ${t.conviction}/5` : "Closed"} · since {formatDate(t.createdAt)}</span>
            {t.assets.map((a) => (
              <Link key={a.id} href={`/app/graph?focus=${a.id}`} className="font-mono text-xs hover:text-cobalt">{a.symbol ?? a.name}</Link>
            ))}
          </span>
        }
        actions={
          <Link href="/app/research" className="eyebrow flex items-center gap-1 text-gray hover:text-ink">
            <ArrowLeft className="size-3" /> All research
          </Link>
        }
      />
      <div className="grid gap-x-10 gap-y-12 px-4 pb-20 sm:px-8 lg:grid-cols-[1fr_300px]">
        <div className="space-y-12">
          <section className="space-y-3">
            <SectionLabel index="01">Statement</SectionLabel>
            <p className="max-w-3xl whitespace-pre-line leading-relaxed">{t.statement}</p>
            {t.origin ? <Link href={`/app/memory?id=${t.origin.memoryId}`} className="eyebrow text-gray hover:text-cobalt">Open in memory</Link> : null}
          </section>

          <section className="grid gap-8 md:grid-cols-2">
            <EvidenceList title="Supports" tone="text-cobalt" thesisId={t.id} items={t.supporting} empty="Nothing linked yet." />
            <EvidenceList title="Against" tone="text-danger" thesisId={t.id} items={t.contradicting} empty="No counter-evidence linked. Look for some: it is the fastest way to test a thesis." />
          </section>

          <section className="space-y-4">
            <SectionLabel index="03">Link evidence</SectionLabel>
            <EvidenceLinker thesisId={t.id} exclude={evidenceIds} />
          </section>

          {related.length ? (
            <section className="space-y-4">
              <SectionLabel index="04">Insights about this thesis</SectionLabel>
              <div className="grid gap-4 md:grid-cols-2">
                {related.slice(0, 4).map((i) => <InsightCard key={i.id} insight={i} />)}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-10">
          <section className="space-y-4">
            <SectionLabel>Update</SectionLabel>
            <ThesisControls thesis={t} />
          </section>
          <section className="space-y-3">
            <SectionLabel>History</SectionLabel>
            {t.updates.length ? (
              <ol className="space-y-3 text-sm">
                {t.updates.map((u) => (
                  <li key={u.id} className="space-y-0.5">
                    <p className="eyebrow text-gray">{formatDate(u.at)}</p>
                    <p className="whitespace-pre-line leading-relaxed">{u.content.replace(/ on the thesis “.*?”\./, ".")}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-gray">No changes since it was written.</p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

type Evidence = { memoryId: string; title: string; type: string; content: string; at: Date };

function EvidenceList({ title, tone, thesisId, items, empty }: { title: string; tone: string; thesisId: string; items: Evidence[]; empty: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between border-t border-ink pt-2">
        <h2 className={`eyebrow ${tone}`}>{title} · {items.length}</h2>
      </div>
      {items.length ? (
        <ul className="divide-y divide-line">
          {items.map((e) => (
            <li key={e.memoryId} className="flex gap-3 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <Link href={`/app/memory?id=${e.memoryId}`} className="font-medium hover:text-cobalt">{e.title}</Link>
                <p className="eyebrow text-gray">{label(e.type)} · {formatDate(e.at)}</p>
                <p className="line-clamp-2 text-sm text-gray">{e.content}</p>
              </div>
              <RemoveEvidence thesisId={thesisId} memoryId={e.memoryId} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray">{empty}</p>
      )}
    </div>
  );
}
