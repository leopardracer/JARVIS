import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { schema, type Database } from "@jarvis/db";

const { portfolios, positions, transactions, entities, watchlists, watchlistItems, insights, research, theses, thesisMemories, thesisAssets, memories } = schema;

export async function portfolioView(db: Database, userId: string) {
  const ports = await db.select().from(portfolios).where(eq(portfolios.userId, userId));
  if (!ports.length) return null;
  const ids = ports.map((p) => p.id);
  const pos = await db
    .select({ id: positions.id, portfolioId: positions.portfolioId, quantity: positions.quantity, averageCost: positions.averageCost, currency: positions.currency, asOf: positions.asOf, assetId: entities.id, symbol: entities.symbol, name: entities.name })
    .from(positions)
    .innerJoin(entities, eq(entities.id, positions.assetEntityId))
    .where(inArray(positions.portfolioId, ids));
  const tx = await db
    .select({ id: transactions.id, side: transactions.side, quantity: transactions.quantity, price: transactions.price, currency: transactions.currency, executedAt: transactions.executedAt, dataMode: transactions.dataMode, memoryId: transactions.memoryId, symbol: entities.symbol, name: entities.name })
    .from(transactions)
    .innerJoin(entities, eq(entities.id, transactions.assetEntityId))
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.executedAt))
    .limit(50);

  const holdings = pos.map((p) => {
    const quantity = Number(p.quantity);
    const averageCost = p.averageCost === null ? null : Number(p.averageCost);
    return { ...p, quantity, averageCost, costBasis: averageCost === null ? null : quantity * averageCost };
  });
  const totalCost = holdings.reduce((s, h) => s + (h.costBasis ?? 0), 0);
  return {
    portfolios: ports,
    dataMode: ports.some((p) => p.dataMode === "live") ? "live" : "demo",
    holdings: holdings
      .map((h) => ({ ...h, weight: totalCost && h.costBasis ? h.costBasis / totalCost : null }))
      .sort((a, b) => (b.costBasis ?? 0) - (a.costBasis ?? 0)),
    totalCost,
    transactions: tx.map((t) => ({ ...t, quantity: Number(t.quantity), price: t.price === null ? null : Number(t.price) })),
  };
}

export async function watchlistView(db: Database, userId: string) {
  const lists = await db.select().from(watchlists).where(eq(watchlists.userId, userId));
  if (!lists.length) return [];
  const items = await db
    .select({ watchlistId: watchlistItems.watchlistId, note: watchlistItems.note, createdAt: watchlistItems.createdAt, assetId: entities.id, symbol: entities.symbol, name: entities.name, description: entities.description })
    .from(watchlistItems)
    .innerJoin(entities, eq(entities.id, watchlistItems.assetEntityId))
    .where(inArray(watchlistItems.watchlistId, lists.map((l) => l.id)));
  return lists.map((l) => ({ ...l, items: items.filter((i) => i.watchlistId === l.id) }));
}

export async function insightsView(db: Database, userId: string, limit = 20) {
  return db
    .select()
    .from(insights)
    .where(and(eq(insights.userId, userId), ne(insights.status, "dismissed")))
    .orderBy(desc(insights.createdAt))
    .limit(limit);
}

export async function researchView(db: Database, userId: string) {
  return db.select().from(research).where(eq(research.userId, userId)).orderBy(desc(research.createdAt));
}

export async function thesesView(db: Database, userId: string) {
  const rows = await db.select().from(theses).where(eq(theses.userId, userId)).orderBy(desc(theses.createdAt));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const links = await db
    .select({ thesisId: thesisMemories.thesisId, relation: thesisMemories.relation, memoryId: memories.id, title: memories.title, type: memories.type })
    .from(thesisMemories)
    .innerJoin(memories, eq(memories.id, thesisMemories.memoryId))
    .where(inArray(thesisMemories.thesisId, ids));
  const assets = await db
    .select({ thesisId: thesisAssets.thesisId, symbol: entities.symbol, name: entities.name })
    .from(thesisAssets)
    .innerJoin(entities, eq(entities.id, thesisAssets.assetEntityId))
    .where(inArray(thesisAssets.thesisId, ids));
  return rows.map((r) => {
    const evidence = links.filter((l) => l.thesisId === r.id && l.relation !== "origin");
    return {
      ...r,
      assets: assets.filter((a) => a.thesisId === r.id),
      supporting: evidence.filter((e) => e.relation === "supports"),
      contradicting: evidence.filter((e) => e.relation === "contradicts"),
    };
  });
}
