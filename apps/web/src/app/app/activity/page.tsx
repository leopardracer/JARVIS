import Link from "next/link";
import { cn } from "@jarvis/ui";
import { PageHeader } from "@/components/shell";
import { pageUser } from "@/server/auth";
import { services } from "@/server/container";
import { ACTIVITY_GROUPS, activityGroup, activityView } from "@/server/queries";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Activity" };

type Props = { searchParams: Promise<{ group?: string }> };

const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });

function subjectHref(a: { subjectType: string | null; subjectId: string | null }) {
  if (!a.subjectId) return null;
  switch (a.subjectType) {
    case "memory":
      return `/app/memory?id=${a.subjectId}`;
    case "thesis":
      return `/app/research/theses/${a.subjectId}`;
    case "insight":
      return "/app/insights";
    case "research":
      return "/app/research";
    case "entity":
      return `/app/graph?focus=${a.subjectId}`;
    case "portfolio":
      return "/app/portfolio";
    default:
      return null;
  }
}

export default async function ActivityPage({ searchParams }: Props) {
  const { group: raw } = await searchParams;
  const group = raw && raw in ACTIVITY_GROUPS ? raw : undefined;
  const user = await pageUser();
  const { db } = await services();
  const days = await activityView(db, user.id, { group });

  return (
    <>
      <PageHeader index="08 — Activity" title="Timeline" description="Everything that happened in this workspace, newest first: what you saved, traded, believed and asked, and what JARVIS noticed." />
      <div className="space-y-8 px-4 pb-20 sm:px-8">
        <nav className="flex flex-wrap gap-2" aria-label="Filter activity">
          {[undefined, ...Object.keys(ACTIVITY_GROUPS)].map((g) => (
            <Link
              key={g ?? "all"}
              href={g ? `/app/activity?group=${g}` : "/app/activity"}
              className={cn("eyebrow border px-2.5 py-1", group === g ? "border-ink bg-ink text-white" : "border-line text-gray hover:border-ink hover:text-ink")}
            >
              {g ? ACTIVITY_GROUPS[g].label : "All"}
            </Link>
          ))}
        </nav>
        {days.length === 0 ? (
          <p className="text-sm text-gray">Nothing here yet.</p>
        ) : (
          <ol className="space-y-10">
            {days.map((d) => (
              <li key={d.day} className="grid gap-3 md:grid-cols-[160px_1fr]">
                <h2 className="eyebrow pt-3 text-ink md:sticky md:top-4 md:self-start">{formatDate(d.day)}</h2>
                <ol className="divide-y divide-line border-y border-line">
                  {d.items.map((a) => {
                    const href = subjectHref(a);
                    const g = activityGroup(a.kind);
                    return (
                      <li key={a.id} className="grid grid-cols-[48px_1fr] gap-x-4 gap-y-1 py-3 text-sm sm:grid-cols-[48px_96px_1fr]">
                        <span className="tabular text-gray">{timeFmt.format(a.createdAt)}</span>
                        <span className={cn("eyebrow self-center", g === "insight" ? "text-cobalt" : "text-gray")}>{ACTIVITY_GROUPS[g].label}</span>
                        <span className="col-span-2 sm:col-span-1">{href ? <Link href={href} className="hover:text-cobalt">{a.summary}</Link> : a.summary}</span>
                      </li>
                    );
                  })}
                </ol>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
