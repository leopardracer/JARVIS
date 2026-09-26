import { SectionLabel } from "@jarvis/ui";
import { EmptyState } from "@/components/brand";
import { PageHeader } from "@/components/shell";
import { AddToWatchlist, WatchCard } from "@/components/watchlist-manager";
import { pageUser } from "@/server/auth";
import { services } from "@/server/container";
import { watchlistView } from "@/server/queries";

export const metadata = { title: "Watchlist" };

export default async function WatchlistPage() {
  const user = await pageUser();
  const { db } = await services();
  const lists = await watchlistView(db, user.id);
  const items = lists.flatMap((l) => l.items);

  return (
    <>
      <PageHeader index="08 — Watchlist" title="Watchlist" description="Assets you are watching and what you are watching them for, with how often they come up in your memory and the theses that depend on them." />
      <div className="space-y-12 px-4 pb-20 sm:px-8">
        <section className="max-w-3xl space-y-3">
          <SectionLabel index="01">Add</SectionLabel>
          <AddToWatchlist />
        </section>
        {items.length === 0 ? (
          <EmptyState title="Nothing on watch">Add a ticker above. JARVIS links it to your graph, so every memory that mentions it shows up here.</EmptyState>
        ) : (
          lists.map((l, i) => (
            <section key={l.id} className="space-y-4">
              <SectionLabel index={String(i + 2).padStart(2, "0")} action={<span className="eyebrow text-gray">{l.items.length} assets</span>}>{l.name}</SectionLabel>
              <ul className="grid gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
                {l.items.map((item) => (
                  <WatchCard key={item.assetId} item={{ ...item, lastMentioned: item.lastMentioned?.toISOString() ?? null }} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </>
  );
}
