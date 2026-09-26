import { and, asc, eq } from "drizzle-orm";
import { schema, type Database } from "@jarvis/db";
import { positionsFromFills } from "./mock";
import type { BrokerAsset, BrokerProvider, BrokerTransaction } from "./types";

export type SyncResult = {
  portfolioId: string;
  accountId: string;
  transactionsAdded: number;
  positions: number;
  /** External transaction id → stored transaction id, for every fill the provider returned. */
  transactionIds: Map<string, string>;
};

export type SyncOptions = {
  db: Database;
  userId: string;
  provider: BrokerProvider;
  /** Returns the knowledge-graph entity id for an asset, creating it when needed. */
  resolveAsset: (asset: BrokerAsset) => Promise<string>;
  /** Graph entity that represents the portfolio, if the caller keeps one. */
  portfolioEntityId?: string;
  /**
   * Rebuild positions from the stored transactions instead of the provider's
   * view. Used for the demo brokerage, whose ledger also holds paper orders.
   */
  positionsFromLedger?: boolean;
};

/**
 * Pull accounts, positions and transactions from a provider into the local
 * tables. Idempotent: transactions are keyed by the provider's id, positions
 * are replaced with the provider's current view. Read-only towards the broker.
 */
export async function syncBrokerAccounts(opts: SyncOptions): Promise<SyncResult[]> {
  const { db, userId, provider } = opts;
  const results: SyncResult[] = [];
  const syncedAt = new Date();

  for (const account of await provider.getAccounts()) {
    const [portfolio] = await db
      .insert(schema.portfolios)
      .values({
        userId,
        name: account.name,
        provider: provider.name,
        externalId: account.id,
        dataMode: provider.dataMode,
        entityId: opts.portfolioEntityId,
        syncedAt,
      })
      .onConflictDoUpdate({
        target: [schema.portfolios.userId, schema.portfolios.provider, schema.portfolios.externalId],
        set: { name: account.name, syncedAt, dataMode: provider.dataMode },
      })
      .returning();

    const assetIds = new Map<string, string>();
    const assetId = async (a: BrokerAsset) => {
      let id = assetIds.get(a.symbol);
      if (!id) {
        id = await opts.resolveAsset(a);
        assetIds.set(a.symbol, id);
      }
      return id;
    };

    const fills = await provider.getTransactions(account.id);
    let added = 0;
    const transactionIds = new Map<string, string>();
    for (const t of fills) {
      const inserted = await db
        .insert(schema.transactions)
        .values({
          userId,
          portfolioId: portfolio.id,
          assetEntityId: await assetId(t),
          side: t.side,
          quantity: t.quantity,
          price: t.price,
          fees: t.fees,
          currency: t.currency,
          executedAt: t.executedAt,
          dataMode: provider.dataMode,
          externalId: t.id,
        })
        .onConflictDoNothing()
        .returning({ id: schema.transactions.id });
      if (inserted.length) {
        added++;
        transactionIds.set(t.id, inserted[0].id);
      } else {
        const [existing] = await db
          .select({ id: schema.transactions.id })
          .from(schema.transactions)
          .where(and(eq(schema.transactions.portfolioId, portfolio.id), eq(schema.transactions.externalId, t.id)));
        if (existing) transactionIds.set(t.id, existing.id);
      }
    }

    let positionCount: number;
    if (opts.positionsFromLedger) {
      positionCount = await rebuildPositionsFromLedger(db, portfolio.id);
    } else {
      const positions = await provider.getPositions(account.id);
      await db.delete(schema.positions).where(eq(schema.positions.portfolioId, portfolio.id));
      for (const p of positions) {
        await db.insert(schema.positions).values({
          portfolioId: portfolio.id,
          assetEntityId: await assetId(p),
          quantity: p.quantity,
          averageCost: p.averageCost,
          currency: p.currency,
          asOf: syncedAt,
        });
      }
      positionCount = positions.length;
    }

    results.push({ portfolioId: portfolio.id, accountId: account.id, transactionsAdded: added, positions: positionCount, transactionIds });
  }
  return results;
}

/** Replace a portfolio's positions with average-cost positions replayed from its transactions. */
export async function rebuildPositionsFromLedger(db: Database, portfolioId: string): Promise<number> {
  const rows = await db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.portfolioId, portfolioId))
    .orderBy(asc(schema.transactions.executedAt));
  // The asset entity id stands in for the symbol so positions map straight back to entities.
  const fills: BrokerTransaction[] = rows.map((r) => ({
    id: r.id,
    symbol: r.assetEntityId,
    name: r.assetEntityId,
    assetClass: "equity",
    side: r.side as BrokerTransaction["side"],
    quantity: r.quantity,
    price: r.price,
    fees: r.fees,
    currency: r.currency,
    executedAt: r.executedAt,
  }));
  const positions = positionsFromFills(fills);
  await db.delete(schema.positions).where(eq(schema.positions.portfolioId, portfolioId));
  const asOf = new Date();
  for (const p of positions) {
    await db.insert(schema.positions).values({ portfolioId, assetEntityId: p.symbol, quantity: p.quantity, averageCost: p.averageCost, currency: p.currency, asOf });
  }
  return positions.length;
}
