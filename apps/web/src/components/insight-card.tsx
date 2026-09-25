import Link from "next/link";
import { Badge, cn } from "@jarvis/ui";
import { label, timeAgo } from "@/lib/format";

type Insight = {
  id: string;
  kind: string;
  title: string;
  whatChanged: string;
  whyItMatters: string;
  evidence: { label: string; memoryId?: string }[];
  createdAt: Date | string;
};

export function InsightCard({ insight, compact, actions }: { insight: Insight & { status?: string }; compact?: boolean; actions?: React.ReactNode }) {
  return (
    <article className={cn("flex flex-col gap-3 border border-line p-5", !compact && "sm:p-6")}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <Badge tone="cobalt">{label(insight.kind)}</Badge>
          {insight.status === "new" && !compact ? <span className="size-1.5 bg-signal" aria-label="New" /> : null}
        </span>
        <span className="eyebrow text-gray">{timeAgo(insight.createdAt)}</span>
      </div>
      <h3 className="text-lg font-semibold leading-snug tracking-tight">{insight.title}</h3>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="eyebrow text-gray">What changed</dt>
          <dd className="leading-relaxed">{insight.whatChanged}</dd>
        </div>
        {!compact ? (
          <div>
            <dt className="eyebrow text-gray">Why it matters</dt>
            <dd className="leading-relaxed">{insight.whyItMatters}</dd>
          </div>
        ) : null}
      </dl>
      {!compact && insight.evidence.length ? (
        <div className="space-y-1 border-t border-line pt-3">
          <p className="eyebrow text-gray">Evidence</p>
          <ul className="space-y-1 text-sm">
            {insight.evidence.map((e, i) => (
              <li key={i}>
                {e.memoryId ? (
                  <Link href={`/app/memory?id=${e.memoryId}`} className="text-cobalt underline-offset-4 hover:underline">{e.label}</Link>
                ) : (
                  e.label
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {actions ? <div className="-mb-2 mt-auto flex justify-end border-t border-line pt-2">{actions}</div> : null}
    </article>
  );
}
