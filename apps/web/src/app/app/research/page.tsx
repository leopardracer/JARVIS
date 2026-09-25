import Link from "next/link";
import { Badge, SectionLabel } from "@jarvis/ui";
import { EmptyState } from "@/components/brand";
import { PageHeader } from "@/components/shell";
import { pageUser } from "@/server/auth";
import { services } from "@/server/container";
import { researchView, thesesView } from "@/server/queries";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Research" };

export default async function ResearchPage() {
  const user = await pageUser();
  const { db } = await services();
  const [theses, research] = await Promise.all([thesesView(db, user.id), researchView(db, user.id)]);

  return (
    <>
      <PageHeader index="05 — Research" title="Research" description="Your theses with the evidence for and against them, and the research questions you have worked through." />
      <div className="space-y-14 px-4 pb-20 sm:px-8">
        <section className="space-y-5">
          <SectionLabel index="01">Theses</SectionLabel>
          {theses.length === 0 ? (
            <EmptyState title="No theses yet" size={96}>Save a memory with the type “thesis”. JARVIS will track what supports it and what argues against it.</EmptyState>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {theses.map((t) => (
                <article key={t.id} className="flex flex-col gap-4 border border-line p-5">
                  <div className="flex items-center gap-2">
                    <Badge tone={t.stance === "bearish" ? "danger" : "cobalt"}>{t.stance}</Badge>
                    <span className="eyebrow text-gray">Conviction {t.conviction}/5</span>
                    <span className="eyebrow ml-auto text-gray">{t.assets.map((a) => a.symbol).join(" ")}</span>
                  </div>
                  <h3 className="text-lg font-semibold leading-snug tracking-tight">{t.title}</h3>
                  <p className="line-clamp-4 text-sm leading-relaxed text-gray">{t.statement}</p>
                  <div className="mt-auto grid grid-cols-2 gap-4 border-t border-line pt-3 text-sm">
                    <Evidence title="Supports" items={t.supporting} tone="text-cobalt" />
                    <Evidence title="Against" items={t.contradicting} tone="text-danger" />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-5">
          <SectionLabel index="02">Research log</SectionLabel>
          {research.length === 0 ? (
            <p className="text-sm text-gray">No research yet. Automated research runs arrive in Phase 2; save research notes as memories meanwhile.</p>
          ) : (
            <ol className="divide-y divide-line border-y border-line">
              {research.map((r) => (
                <li key={r.id} className="grid gap-2 py-4 sm:grid-cols-[140px_1fr]">
                  <span className="eyebrow text-gray">{formatDate(r.createdAt)} · {r.status}</span>
                  <div className="space-y-1">
                    <p className="font-medium">{r.query}</p>
                    {r.summary ? <p className="text-sm leading-relaxed text-gray">{r.summary}</p> : null}
                    {r.memoryId ? <Link href={`/app/memory?id=${r.memoryId}`} className="text-sm text-cobalt hover:underline">Open note</Link> : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}

function Evidence({ title, items, tone }: { title: string; items: { memoryId: string; title: string }[]; tone: string }) {
  return (
    <div className="space-y-1">
      <p className={`eyebrow ${tone}`}>{title} · {items.length}</p>
      <ul className="space-y-1">
        {items.map((i) => (
          <li key={i.memoryId}>
            <Link href={`/app/memory?id=${i.memoryId}`} className="line-clamp-2 hover:underline">{i.title}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
