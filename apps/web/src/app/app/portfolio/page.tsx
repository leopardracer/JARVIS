import Link from "next/link";
import { Badge, SectionLabel } from "@jarvis/ui";
import { EmptyState } from "@/components/brand";
import { PageHeader } from "@/components/shell";
import { pageUser } from "@/server/auth";
import { services } from "@/server/container";
import { portfolioView } from "@/server/queries";
import { formatDate, money, percent, quantity } from "@/lib/format";

export const metadata = { title: "Portfolio" };

export default async function PortfolioPage() {
  const user = await pageUser();
  const { db } = await services();
  const p = await portfolioView(db, user.id);

  return (
    <>
      <PageHeader
        index="04 — Portfolio"
        title="Portfolio"
        description="Positions and trades, linked to the memories behind them. JARVIS shows cost basis only; it does not show market prices it cannot source."
        actions={p ? <Badge tone={p.dataMode === "demo" ? "signal" : "ink"}>{p.dataMode === "demo" ? "Demo · illustrative" : "Live"}</Badge> : null}
      />
      <div className="space-y-14 px-4 pb-20 sm:px-8">
        {!p ? (
          <EmptyState title="No portfolio yet">
            Brokerage connections (Robinhood through its official APIs) arrive in Phase 3. Until then, save trades as memories and JARVIS will connect them to your theses.
          </EmptyState>
        ) : (
          <>
            <section className="space-y-4">
              <SectionLabel index="01">Positions</SectionLabel>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="eyebrow text-left text-gray">
                      <th className="py-2 font-normal">Asset</th>
                      <th className="py-2 text-right font-normal">Quantity</th>
                      <th className="py-2 text-right font-normal">Avg cost</th>
                      <th className="py-2 text-right font-normal">Cost basis</th>
                      <th className="py-2 text-right font-normal">Weight</th>
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
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            <section className="space-y-4">
              <SectionLabel index="02">Transactions</SectionLabel>
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
