import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn, SectionLabel } from "@jarvis/ui";
import { BRIEFING_PERIODS, type BriefingPeriod } from "@jarvis/types";
import { RefreshBriefingButton } from "@/components/agent-forms";
import { PageHeader } from "@/components/shell";
import { listAgents } from "@/server/agents";
import { pageUser } from "@/server/auth";
import { briefingById, briefingHistory, currentBriefing } from "@/server/briefing";
import { services } from "@/server/container";
import { formatDate, timeAgo } from "@/lib/format";

export const metadata = { title: "Briefing" };

const rangeFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false });

export default async function BriefingPage({ searchParams }: PageProps<"/app/briefing">) {
  const user = await pageUser();
  const params = await searchParams;
  const period: BriefingPeriod = BRIEFING_PERIODS.find((p) => p === params.period) ?? "weekly";
  const svc = await services();
  const archived = typeof params.id === "string" && /^[0-9a-f-]{36}$/.test(params.id) ? await briefingById(svc.db, user.id, params.id) : null;
  const briefing = archived ?? (await currentBriefing(svc, user.id, period));
  const shown = briefing.period as BriefingPeriod;
  const [history, agents] = await Promise.all([briefingHistory(svc.db, user.id, shown), listAgents(svc.db, user.id)]);
  const window = shown === "daily" ? 86_400_000 : 7 * 86_400_000;
  const from = new Date(briefing.periodEnd.getTime() - window);
  const offline = !briefing.provider;

  return (
    <>
      <PageHeader
        index="02 — Briefing"
        title={archived ? `${shown === "daily" ? "Daily" : "Weekly"} briefing, ${formatDate(briefing.periodEnd)}` : shown === "daily" ? "Today" : "This week"}
        description={
          <p className="tabular max-w-xl text-sm leading-relaxed text-gray">
            {rangeFmt.format(from)} to {rangeFmt.format(briefing.periodEnd)} UTC. Built from your own memory, portfolio, graph and agents, ordered by what you hold and write about.
          </p>
        }
        actions={
          <div className="flex items-start gap-2">
            <nav className="flex border border-ink" aria-label="Briefing period">
              {BRIEFING_PERIODS.map((p) => (
                <Link
                  key={p}
                  href={`/app/briefing?period=${p}`}
                  aria-current={!archived && p === shown ? "page" : undefined}
                  className={cn("eyebrow px-3 py-2", !archived && p === shown ? "bg-ink text-white" : "text-ink hover:bg-surface")}
                >
                  {p === "daily" ? "Day" : "Week"}
                </Link>
              ))}
            </nav>
            {archived ? null : <RefreshBriefingButton period={shown} />}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-x-10 gap-y-14 px-4 pb-20 sm:px-8 lg:grid-cols-12">
        <div className="space-y-14 lg:col-span-8">
          <section className="space-y-4 border-t-2 border-ink pt-5">
            <p className="text-balance text-2xl font-medium leading-snug tracking-tight sm:text-3xl">{briefing.lede}</p>
            <p className="eyebrow text-gray">
              {offline ? "Written from your records by rules, no language model" : `Written by ${briefing.provider} from the items below only`} · updated {timeAgo(briefing.updatedAt)}
            </p>
          </section>

          {briefing.sections.length === 0 ? (
            <p className="text-sm text-gray">Nothing to report for this period. Save notes, run research or set up an agent and the next briefing will pick it up.</p>
          ) : (
            briefing.sections.map((s, si) => (
              <section key={s.key} className="space-y-4">
                <SectionLabel index={String(si + 1).padStart(2, "0")}>{s.title}</SectionLabel>
                <ol className="divide-y divide-line">
                  {s.items.map((item, i) => (
                    <li key={i} className="grid grid-cols-[28px_1fr] gap-x-3 py-3.5">
                      <span className="tabular pt-0.5 font-mono text-xs text-gray">{String(i + 1).padStart(2, "0")}</span>
                      <div className="min-w-0 space-y-1">
                        {item.href ? (
                          <Link href={item.href} className="group inline-flex items-baseline gap-1 font-medium leading-snug hover:text-cobalt">
                            {item.text}
                            <ArrowUpRight className="size-3 shrink-0 text-gray group-hover:text-cobalt" />
                          </Link>
                        ) : (
                          <p className="font-medium leading-snug">{item.text}</p>
                        )}
                        {item.detail ? <p className="text-sm leading-relaxed text-gray">{item.detail}</p> : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ))
          )}
        </div>

        <aside className="space-y-10 lg:col-span-4">
          <section className="space-y-3">
            <SectionLabel action={<Link href="/app/research#agents" className="eyebrow text-gray hover:text-cobalt">Manage</Link>}>Agents</SectionLabel>
            {agents.length ? (
              <ul className="space-y-3">
                {agents.map((a) => (
                  <li key={a.id} className="space-y-0.5 text-sm">
                    <p className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-medium">{a.name}</span>
                      <span className="eyebrow shrink-0 text-gray">{a.enabled ? (a.cadence === "daily" ? "Daily" : "Weekly") : "Paused"}</span>
                    </p>
                    <p className="text-xs text-gray">{a.lastRunAt ? `Ran ${timeAgo(a.lastRunAt)}${a.last?.status === "unchanged" ? ", nothing new" : ""}` : "Not run yet"}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray">No agents yet. <Link href="/app/research#agents" className="text-cobalt underline underline-offset-4">Set one up</Link> to have a question checked every day or week.</p>
            )}
          </section>

          <section className="space-y-3">
            <SectionLabel>Earlier briefings</SectionLabel>
            {history.length > 1 ? (
              <ol className="divide-y divide-line border-b border-line">
                {history.map((h) => (
                  <li key={h.id}>
                    <Link href={`/app/briefing?id=${h.id}`} aria-current={h.id === briefing.id ? "page" : undefined} className={cn("block space-y-0.5 py-2.5 hover:text-cobalt", h.id === briefing.id && "text-cobalt")}>
                      <span className="eyebrow block text-gray">{formatDate(h.periodStart)}</span>
                      <span className="line-clamp-2 text-sm">{h.lede}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-gray">Each {shown === "daily" ? "day" : "week"} gets its own briefing. Past ones stay here.</p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
