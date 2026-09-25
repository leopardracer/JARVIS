import Link from "next/link";
import { SectionLabel } from "@jarvis/ui";
import { EmptyState } from "@/components/brand";
import { ResearchForm } from "@/components/research-form";
import { PageHeader } from "@/components/shell";
import { NewThesisForm, StanceBadge } from "@/components/thesis-forms";
import { pageUser } from "@/server/auth";
import { services } from "@/server/container";
import { researchView, thesesView } from "@/server/queries";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Research" };

export default async function ResearchPage() {
  const user = await pageUser();
  const { db, ai } = await services();
  const [theses, research] = await Promise.all([thesesView(db, user.id), researchView(db, user.id)]);
  const active = theses.filter((t) => t.status === "active");
  const closed = theses.filter((t) => t.status !== "active");

  return (
    <>
      <PageHeader index="05 — Research" title="Research" description="Your theses with the evidence for and against them, and research runs that read your memory and save a cited brief back into it." />
      <div className="space-y-14 px-4 pb-20 sm:px-8">
        <section className="space-y-5">
          <SectionLabel index="01" action={<NewThesisForm />}>Theses</SectionLabel>
          {theses.length === 0 ? (
            <EmptyState title="No theses yet" size={96}>Write down what you believe and what would change your mind. JARVIS tracks what supports it and what argues against it.</EmptyState>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[...active, ...closed].map((t) => (
                <Link key={t.id} href={`/app/research/theses/${t.id}`} className={`group flex flex-col gap-4 border border-line p-5 hover:border-ink ${t.status !== "active" ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-2">
                    <StanceBadge stance={t.stance} />
                    <span className="eyebrow text-gray">{t.status === "active" ? `Conviction ${t.conviction}/5` : "Closed"}</span>
                    <span className="eyebrow ml-auto font-mono text-gray">{t.assets.map((a) => a.symbol).join(" ")}</span>
                  </div>
                  <h3 className="text-lg font-semibold leading-snug tracking-tight group-hover:text-cobalt">{t.title}</h3>
                  <p className="line-clamp-3 text-sm leading-relaxed text-gray">{t.statement}</p>
                  <EvidenceBar support={t.supporting.length} against={t.contradicting.length} />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-5">
          <SectionLabel index="02">Run research</SectionLabel>
          <div className="max-w-3xl">
            <ResearchForm
              offline={!ai.isLanguageModel}
              suggestions={active.length ? [`What would break “${active[0].title}”?`, "Which of my positions have no written thesis?", "What risks keep coming up in my notes?"] : []}
            />
          </div>
        </section>

        <section className="space-y-5">
          <SectionLabel index="03">Research log</SectionLabel>
          {research.length === 0 ? (
            <p className="text-sm text-gray">No research yet. Ask a question above; the brief is saved to your memory as a research note.</p>
          ) : (
            <ol className="divide-y divide-line border-y border-line">
              {research.map((r) => (
                <li key={r.id} className="grid gap-2 py-5 sm:grid-cols-[160px_1fr]">
                  <div className="eyebrow space-y-1 text-gray">
                    <p>{formatDate(r.createdAt)}</p>
                    <p className={r.status === "failed" ? "text-danger" : r.status === "running" ? "text-cobalt" : ""}>{r.status}</p>
                    {r.provider ? <p>{r.provider === "mock" ? "offline" : r.provider}</p> : null}
                  </div>
                  <div className="max-w-3xl space-y-2">
                    <p className="font-medium">{r.query}</p>
                    {r.summary ? <p className="whitespace-pre-line text-sm leading-relaxed text-gray">{r.summary}</p> : null}
                    {r.sources.length ? (
                      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        {r.sources.map((s) =>
                          s.memoryId ? (
                            <Link key={s.memoryId} href={`/app/memory?id=${s.memoryId}`} className="text-cobalt hover:underline">
                              {s.ref ? `[${s.ref}] ` : ""}{s.title}
                            </Link>
                          ) : (
                            <span key={s.title}>{s.title}</span>
                          ),
                        )}
                      </p>
                    ) : null}
                    {r.memoryId ? <Link href={`/app/memory?id=${r.memoryId}`} className="eyebrow inline-block text-gray hover:text-cobalt">Saved to memory</Link> : null}
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

function EvidenceBar({ support, against }: { support: number; against: number }) {
  const total = support + against;
  return (
    <div className="mt-auto space-y-1.5 border-t border-line pt-3">
      <div className="flex h-1.5 bg-surface">
        {total ? (
          <>
            <span className="bg-cobalt" style={{ width: `${(support / total) * 100}%` }} />
            <span className="bg-danger" style={{ width: `${(against / total) * 100}%` }} />
          </>
        ) : null}
      </div>
      <p className="eyebrow flex justify-between text-gray">
        <span className="text-cobalt">For · {support}</span>
        <span className={against >= support && against ? "text-danger" : ""}>Against · {against}</span>
      </p>
    </div>
  );
}
