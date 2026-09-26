import Link from "next/link";
import type { schema } from "@jarvis/db";

type AuditRow = typeof schema.auditLogs.$inferSelect;
const auditTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "UTC" });

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  if (!rows.length) return <p className="text-sm text-gray">No events yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="eyebrow text-left text-gray">
            <th className="py-2 font-normal">Time (UTC)</th>
            <th className="py-2 font-normal">Event</th>
            <th className="py-2 font-normal">Target</th>
            <th className="py-2 font-normal">Details</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line border-y border-line">
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="tabular whitespace-nowrap py-2.5 pr-4 text-gray">{auditTime.format(r.createdAt)}</td>
              <td className="whitespace-nowrap py-2.5 pr-4 font-mono text-xs">{r.event}</td>
              <td className="py-2.5 pr-4">
                {r.targetType === "action" && r.targetId ? (
                  <Link href={`/app/actions/${r.targetId}`} className="text-cobalt hover:underline">action</Link>
                ) : (
                  <span className="text-gray">{r.targetType ?? "—"}</span>
                )}
              </td>
              <td className="max-w-md break-words py-2.5 font-mono text-[11px] text-gray">{Object.keys(r.metadata).length ? JSON.stringify(r.metadata) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
