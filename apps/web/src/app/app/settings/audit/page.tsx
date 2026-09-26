import Link from "next/link";
import { and, desc, eq, like } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { schema } from "@jarvis/db";
import { cn } from "@jarvis/ui";
import { AuditTable } from "@/components/audit-table";
import { PageHeader } from "@/components/shell";
import { pageUser } from "@/server/auth";
import { services } from "@/server/container";

export const metadata = { title: "Audit log" };

const FILTERS = [
  { key: "action", label: "Actions" },
  { key: "connection", label: "Connections" },
  { key: "auth", label: "Sign-in" },
  { key: "memory", label: "Memory" },
  { key: "portfolio", label: "Portfolio" },
];

type Props = { searchParams: Promise<{ type?: string }> };

export default async function AuditPage({ searchParams }: Props) {
  const { type } = await searchParams;
  const filter = FILTERS.find((f) => f.key === type);
  const user = await pageUser();
  const { db } = await services();
  const rows = await db
    .select()
    .from(schema.auditLogs)
    .where(and(eq(schema.auditLogs.userId, user.id), filter ? like(schema.auditLogs.event, `${filter.key}.%`) : undefined))
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(300);

  return (
    <>
      <PageHeader
        index="10 — Settings / Audit"
        title="Audit log"
        description="Every sensitive operation in this workspace: sign-ins, connections, proposals, approvals, refusals and submissions. Entries cannot be edited from the app."
        actions={
          <Link href="/app/settings" className="eyebrow flex items-center gap-1 text-gray hover:text-ink">
            <ArrowLeft className="size-3" /> Settings
          </Link>
        }
      />
      <div className="space-y-6 px-4 pb-20 sm:px-8">
        <nav className="flex flex-wrap gap-2" aria-label="Filter audit log">
          {[undefined, ...FILTERS].map((f) => (
            <Link
              key={f?.key ?? "all"}
              href={f ? `/app/settings/audit?type=${f.key}` : "/app/settings/audit"}
              className={cn("eyebrow border px-2.5 py-1", filter?.key === f?.key ? "border-ink bg-ink text-white" : "border-line text-gray hover:border-ink hover:text-ink")}
            >
              {f?.label ?? "All"}
            </Link>
          ))}
        </nav>
        <AuditTable rows={rows} />
      </div>
    </>
  );
}
