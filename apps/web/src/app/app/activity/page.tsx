import { PageHeader } from "@/components/shell";
import { pageUser } from "@/server/auth";
import { services } from "@/server/container";
import { formatDate, label } from "@/lib/format";

export const metadata = { title: "Activity" };

export default async function ActivityPage() {
  const user = await pageUser();
  const { memory } = await services();
  const items = await memory.recentActivity(user.id, 100);
  return (
    <>
      <PageHeader index="08 — Activity" title="Activity" description="Everything JARVIS and you have done in this workspace, newest first." />
      <div className="px-4 pb-20 sm:px-8">
        {items.length === 0 ? (
          <p className="text-sm text-gray">No activity yet.</p>
        ) : (
          <ol className="divide-y divide-line border-y border-line">
            {items.map((a) => (
              <li key={a.id} className="grid gap-1 py-3 text-sm sm:grid-cols-[140px_160px_1fr]">
                <span className="eyebrow text-gray">{formatDate(a.createdAt)}</span>
                <span className="eyebrow text-gray">{label(a.kind)}</span>
                <span>{a.summary}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
