import Link from "next/link";
import { SectionLabel } from "@jarvis/ui";
import { EmptyState } from "@/components/brand";
import { PageHeader } from "@/components/shell";
import { pageUser } from "@/server/auth";
import { services } from "@/server/container";
import { watchlistView } from "@/server/queries";

export const metadata = { title: "Watchlist" };

export default async function WatchlistPage() {
  const user = await pageUser();
  const { db } = await services();
  const lists = await watchlistView(db, user.id);
  return (
    <>
      <PageHeader index="07 — Watchlist" title="Watchlist" description="Assets you are watching, and what you are watching them for." />
      <div className="space-y-12 px-4 pb-20 sm:px-8">
        {lists.length === 0 ? (
          <EmptyState title="Nothing on watch">Watchlists arrive with Phase 2. Mention an asset with a $TICKER in a memory to start tracking it in your graph.</EmptyState>
        ) : (
          lists.map((l, i) => (
            <section key={l.id} className="space-y-4">
              <SectionLabel index={String(i + 1).padStart(2, "0")}>{l.name}</SectionLabel>
              <ul className="grid gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
                {l.items.map((item) => (
                  <li key={item.assetId} className="bg-white">
                    <Link href={`/app/graph?focus=${item.assetId}`} className="flex h-full flex-col gap-3 p-5 hover:bg-surface">
                      <span className="font-mono text-3xl font-medium tracking-tight">{item.symbol ?? item.name}</span>
                      <span className="text-sm text-gray">{item.description}</span>
                      {item.note ? <span className="mt-auto border-t border-line pt-2 text-sm">{item.note}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </>
  );
}
