import Link from "next/link";
import { exposure } from "@jarvis/knowledge";
import { Badge, SectionLabel } from "@jarvis/ui";
import { SyncButton } from "@/components/actions";
import { EmptyState } from "@/components/brand";
import { PageHeader } from "@/components/shell";
import { pageUser } from "@/server/auth";
import { services } from "@/server/container";
import { portfolioView } from "@/server/queries";
import { formatDate, money, percent, quantity, timeAgo } from "@/lib/format";

export const metadata = { title: "Portfolio" };

export default async function PortfolioPage() {
  const user = await pageUser();
  const { db } = await services();
  const [p, ex] = await Promise.all([portfolioView(db, user.id), exposure(db, user.id)]);
  const synced = p?.portfolios.map((x) => x.syncedAt).filter((d) => d !== null).sort((a, b) => b.getTime() - a.getTime())[0];
  const fromBroker = p?.portfolios.some((x) => x.provider !== "manual");

  return (
    <>
      <PageHeader
        index="05 — Portfolio"
        title="Portfolio"
        description="Positions and trades, linked to the memories and theses behind them. JARVIS measures on cost basis; it does not show market prices it cannot source."
        actions={
          p ? (
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <Badge tone={p.dataMode === "demo" ? "signal" : "ink"}>{p.dataMode === "demo" ? "Demo · illustrative" : "Live"}</Badge>
              {fromBroker ? <SyncButton /> : null}
              {synced ? <span className="eyebrow text-gray">Synced {timeAgo(synced)}</span> : null}
            </div>
          ) : null
        }
      />
      <div className="space-y-14 px-4 pb-20 sm:px-8">
        {!p ? (
          <EmptyState title="No portfolio yet" action={<SyncButton label="Load the demo brokerage" />}>
            Robinhood connects through its official APIs in Settings. To see how JARVIS links trades to your memory first, load a fictional demo account; its rows are marked demo and never mix with live data.
          </EmptyState>
        ) : (
          <>
            <section className="space-y-4">
              <SectionLabel index="01">Positions</SectionLabel>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="eyebrow text-left text-gray">
                      <th className="py-2 font-normal">Asset</th>
                      <th className="py-2 text-right font-normal">Quantity</th>
                      <th className="py-2 text-right font-normal">Avg cost</th>
                      <th className="py-2 text-right font-normal">Cost basis</th>
                      <th className="py-2 text-right font-normal">Weight</th>
                      <th className="py-2 pl-6 font-normal">Thesis</th>
                    </tr>
                  </thead>
                  <tbody className="tabular divide-y divide-line border-y border-line">
                    {p.holdings.map((h) => (
                      <tr key={h.id}>
                        <td className="py-3">
                          <Link href={`/app/graph?focus=${h.assetId}`} className="hover:text-cobalt">
                            <span className="font-mono">{h.symbol}</span> <span className="text-gray">{h.name !== h.symbol ? h.name : ""}</span>
                          </Link>
                        </td>
                        <td className="py-3 text-right">{quantity(h.quantity)}</td>
                        <td className="py-3 text-right">{money(h.averageCost, h.currency)}</td>
                        <td className="py-3 text-right">{money(h.costBasis, h.currency)}</td>
                        <td className="py-3 text-right">{percent(h.weight)}</td>
                        <td className="max-w-64 py-3 pl-6">
                          {h.theses.length ? (
                            h.theses.map((t) => (
                              <Link key={t.id} href={`/app/research/theses/${t.id}`} className="block truncate hover:text-cobalt">
                                <span className={t.stance === "bearish" ? "text-danger" : "text-cobalt"}>{t.conviction}/5</span> {t.title}
                              </Link>
                            ))
                          ) : (
                            <span className="text-gray">None recorded</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-medium">
                      <td className="py-3">Total</td>
                      <td />
                      <td />
                      <td className="tabular py-3 text-right">{money(p.totalCost)}</td>
                      <td className="tabular py-3 text-right">100%</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            <section className="space-y-4">
              <SectionLabel index="02">Exposure by theme</SectionLabel>
              <p className="max-w-2xl text-sm text-gray">
                Share of cost basis linked to each theme in your knowledge graph, directly or through the company behind an asset. Themes overlap, so the bars do not add up to 100%.
              </p>
              {ex.themes.length ? (
                <ul className="divide-y divide-line border-y border-line">
                  {ex.themes.map((t) => (
                    <li key={t.themeId} className="grid items-center gap-2 py-3 text-sm sm:grid-cols-[200px_1fr_64px]">
                      <Link href={`/app/graph?focus=${t.themeId}`} className="font-medium hover:text-cobalt">{t.theme}</Link>
                      <div className="space-y-1">
                        <span className="block h-2 bg-surface">
                          <span className="block h-full bg-cobalt" style={{ width: `${Math.min(100, t.share * 100)}%` }} />
                        </span>
                        <span className="eyebrow block text-gray">
                          {t.assets.map((a) => (a.path.length > 2 ? `${a.symbol ?? a.name} via ${a.path[1]}` : `${a.symbol ?? a.name} direct`)).join(" · ")}
                        </span>
                      </div>
                      <span className="tabular text-right">{percent(t.share)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray">None of your holdings link to a theme yet. Mention a holding together with a theme in a memory to connect them.</p>
              )}
            </section>

            <section className="space-y-4">
              <SectionLabel index="03">Transactions</SectionLabel>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="eyebrow text-left text-gray">
                      <th className="py-2 font-normal">Date</th>
                      <th className="py-2 font-normal">Side</th>
                      <th className="py-2 font-normal">Asset</th>
                      <th className="py-2 text-right font-normal">Quantity</th>
                      <th className="py-2 text-right font-normal">Price</th>
                      <th className="py-2 font-normal" />
                    </tr>
                  </thead>
                  <tbody className="tabular divide-y divide-line border-y border-line">
                    {p.transactions.map((t) => (
                      <tr key={t.id}>
                        <td className="py-3 text-gray">{formatDate(t.executedAt)}</td>
                        <td className="py-3 uppercase">{t.side}</td>
                        <td className="py-3 font-mono">{t.symbol}</td>
                        <td className="py-3 text-right">{quantity(t.quantity)}</td>
                        <td className="py-3 text-right">{money(t.price, t.currency)}</td>
                        <td className="py-3 text-right">
                          {t.memoryId ? <Link href={`/app/memory?id=${t.memoryId}`} className="text-cobalt hover:underline">Why</Link> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}
