import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { schema, type Database } from "@jarvis/db";

const { portfolios, positions, transactions, entities, watchlists, watchlistItems, insights, research, theses, thesisMemories, thesisAssets, memories, memoryEntities, activities } = schema;

/** Active theses per asset, for linking holdings and watchlist items to what you believe about them. */
async function thesesByAsset(db: Database, userId: string, assetIds: string[]) {
  if (!assetIds.length) return new Map<string, { id: string; title: string; stance: string; conviction: number }[]>();
  const rows = await db
    .select({ assetId: thesisAssets.assetEntityId, id: theses.id, title: theses.title, stance: theses.stance, conviction: theses.conviction })
    .from(thesisAssets)
    .innerJoin(theses, eq(theses.id, thesisAssets.thesisId))
    .where(and(eq(theses.userId, userId), eq(theses.status, "active"), inArray(thesisAssets.assetEntityId, assetIds)));
  const map = new Map<string, { id: string; title: string; stance: string; conviction: number }[]>();
  for (const { assetId, ...t } of rows) map.set(assetId, [...(map.get(assetId) ?? []), t]);
  return map;
}

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
  const thesisMap = await thesesByAsset(db, userId, holdings.map((h) => h.assetId));
  return {
    portfolios: ports,
    dataMode: ports.some((p) => p.dataMode === "live") ? "live" : "demo",
    holdings: holdings
      .map((h) => ({ ...h, weight: totalCost && h.costBasis ? h.costBasis / totalCost : null, theses: thesisMap.get(h.assetId) ?? [] }))
      .sort((a, b) => (b.costBasis ?? 0) - (a.costBasis ?? 0)),
    totalCost,
    transactions: tx.map((t) => ({ ...t, quantity: Number(t.quantity), price: t.price === null ? null : Number(t.price) })),
  };
}

export async function watchlistView(db: Database, userId: string) {
  const lists = await db.select().from(watchlists).where(eq(watchlists.userId, userId)).orderBy(watchlists.createdAt);
  if (!lists.length) return [];
  const items = await db
    .select({ watchlistId: watchlistItems.watchlistId, note: watchlistItems.note, createdAt: watchlistItems.createdAt, assetId: entities.id, symbol: entities.symbol, name: entities.name, description: entities.description })
    .from(watchlistItems)
    .innerJoin(entities, eq(entities.id, watchlistItems.assetEntityId))
    .where(inArray(watchlistItems.watchlistId, lists.map((l) => l.id)))
    .orderBy(watchlistItems.createdAt);
  const assetIds = [...new Set(items.map((i) => i.assetId))];
  const mentionRows = assetIds.length
    ? await db
        .select({ assetId: memoryEntities.entityId, n: sql<number>`count(*)::int`, last: sql<Date>`max(coalesce(${memories.occurredAt}, ${memories.createdAt}))` })
        .from(memoryEntities)
        .innerJoin(memories, eq(memories.id, memoryEntities.memoryId))
        .where(and(eq(memories.userId, userId), inArray(memoryEntities.entityId, assetIds)))
        .groupBy(memoryEntities.entityId)
    : [];
  const held = assetIds.length
    ? await db
        .select({ assetId: positions.assetEntityId })
        .from(positions)
        .innerJoin(portfolios, eq(portfolios.id, positions.portfolioId))
        .where(and(eq(portfolios.userId, userId), inArray(positions.assetEntityId, assetIds)))
    : [];
  const heldSet = new Set(held.map((h) => h.assetId));
  const thesisMap = await thesesByAsset(db, userId, assetIds);
  return lists.map((l) => ({
    ...l,
    items: items
      .filter((i) => i.watchlistId === l.id)
      .map((i) => {
        const m = mentionRows.find((r) => r.assetId === i.assetId);
        return { ...i, mentions: Number(m?.n ?? 0), lastMentioned: m?.last ? new Date(m.last) : null, held: heldSet.has(i.assetId), theses: thesisMap.get(i.assetId) ?? [] };
      }),
  }));
}

export async function insightsView(db: Database, userId: string, limit = 20, opts: { kind?: string; dismissed?: boolean } = {}) {
  return db
    .select()
    .from(insights)
    .where(
      and(
        eq(insights.userId, userId),
        opts.dismissed ? eq(insights.status, "dismissed") : ne(insights.status, "dismissed"),
        opts.kind ? eq(insights.kind, opts.kind) : undefined,
      ),
    )
    .orderBy(desc(insights.createdAt), insights.kind)
    .limit(limit);
}

export const ACTIVITY_GROUPS: Record<string, { label: string; kinds: string[] }> = {
  memory: { label: "Memory", kinds: ["memory_created", "memory_updated", "memory_deleted"] },
  portfolio: { label: "Portfolio", kinds: ["portfolio_synced", "trade"] },
  thesis: { label: "Theses", kinds: ["thesis_created", "thesis_updated", "thesis_evidence"] },
  research: { label: "Research", kinds: ["research"] },
  insight: { label: "Insights", kinds: ["insight"] },
  watchlist: { label: "Watchlist", kinds: ["watchlist_added", "watchlist_removed"] },
  ask: { label: "Questions", kinds: ["asked"] },
};

export function activityGroup(kind: string) {
  return Object.entries(ACTIVITY_GROUPS).find(([, g]) => g.kinds.includes(kind))?.[0] ?? "memory";
}

export async function activityView(db: Database, userId: string, opts: { group?: string; limit?: number } = {}) {
  const kinds = opts.group ? ACTIVITY_GROUPS[opts.group]?.kinds : undefined;
  const rows = await db
    .select()
    .from(activities)
    .where(and(eq(activities.userId, userId), kinds ? inArray(activities.kind, kinds) : undefined))
    .orderBy(desc(activities.createdAt))
    .limit(opts.limit ?? 200);
  const days: { day: string; items: typeof rows }[] = [];
  for (const r of rows) {
    const day = r.createdAt.toISOString().slice(0, 10);
    const last = days[days.length - 1];
    if (last?.day === day) last.items.push(r);
    else days.push({ day, items: [r] });
  }
  return days;
}

export async function researchView(db: Database, userId: string) {
  return db.select().from(research).where(eq(research.userId, userId)).orderBy(desc(research.createdAt)).limit(50);
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
