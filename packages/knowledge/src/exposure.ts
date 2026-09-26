import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { schema, type Database } from "@jarvis/db";

const { transactions, positions, portfolios, entities, relationships } = schema;

export type Holding = {
  assetId: string;
  symbol: string | null;
  name: string;
  quantity: number;
  /** Average-cost basis. JARVIS has no market prices, so exposure is measured on cost. */
  cost: number;
};

export type ThemeExposure = {
  themeId: string;
  theme: string;
  cost: number;
  share: number;
  assets: { assetId: string; symbol: string | null; name: string; cost: number; path: string[] }[];
};

export type Exposure = {
  at: Date;
  totalCost: number;
  holdings: Holding[];
  themes: ThemeExposure[];
};

/**
 * Holdings at a point in time, replayed from transactions with the average
 * cost method. Falls back to stored positions when there are no transactions.
 */
export async function holdingsAt(db: Database, userId: string, at?: Date): Promise<Holding[]> {
  const rows = await db
    .select({ assetId: transactions.assetEntityId, side: transactions.side, quantity: transactions.quantity, price: transactions.price, symbol: entities.symbol, name: entities.name })
    .from(transactions)
    .innerJoin(entities, eq(entities.id, transactions.assetEntityId))
    .where(and(eq(transactions.userId, userId), at ? lte(transactions.executedAt, at) : undefined))
    .orderBy(asc(transactions.executedAt));

  if (!rows.length && !at) {
    const pos = await db
      .select({ assetId: positions.assetEntityId, quantity: positions.quantity, averageCost: positions.averageCost, symbol: entities.symbol, name: entities.name })
      .from(positions)
      .innerJoin(portfolios, eq(portfolios.id, positions.portfolioId))
      .innerJoin(entities, eq(entities.id, positions.assetEntityId))
      .where(eq(portfolios.userId, userId));
    return pos.map((p) => ({ assetId: p.assetId, symbol: p.symbol, name: p.name, quantity: Number(p.quantity), cost: Number(p.quantity) * Number(p.averageCost ?? 0) }));
  }

  const book = new Map<string, Holding>();
  for (const r of rows) {
    const h = book.get(r.assetId) ?? { assetId: r.assetId, symbol: r.symbol, name: r.name, quantity: 0, cost: 0 };
    const q = Number(r.quantity);
    if (r.side === "buy") {
      h.quantity += q;
      h.cost += q * Number(r.price ?? 0);
    } else if (r.side === "sell" && h.quantity > 0) {
      h.cost -= (h.cost / h.quantity) * Math.min(q, h.quantity);
      h.quantity = Math.max(0, h.quantity - q);
    }
    book.set(r.assetId, h);
  }
  return [...book.values()].filter((h) => h.quantity > 1e-12);
}

const THEME_EDGES = new Set(["related_to", "derived_from", "depends_on", "similar_to"]);
const BRIDGE_TYPES = new Set(["asset", "company", "protocol"]);

/**
 * Themes each asset belongs to in the user's graph: a theme linked to the
 * asset directly, or through the company or protocol behind it.
 */
export async function themesForAssets(db: Database, userId: string, assetIds: string[]) {
  const result = new Map<string, Map<string, { theme: string; path: string[] }>>();
  if (!assetIds.length) return result;
  const nodes = await db.select({ id: entities.id, type: entities.type, name: entities.name }).from(entities).where(eq(entities.userId, userId));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = await db
    .select({ s: relationships.sourceId, t: relationships.targetId, type: relationships.type })
    .from(relationships)
    .where(and(eq(relationships.userId, userId), eq(relationships.inferred, false), inArray(relationships.type, [...THEME_EDGES] as never[])));
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!adj.has(e.s)) adj.set(e.s, new Set());
    if (!adj.has(e.t)) adj.set(e.t, new Set());
    adj.get(e.s)!.add(e.t);
    adj.get(e.t)!.add(e.s);
  }
  for (const assetId of assetIds) {
    const themes = new Map<string, { theme: string; path: string[] }>();
    const asset = byId.get(assetId);
    for (const n1 of adj.get(assetId) ?? []) {
      const a = byId.get(n1);
      if (!a) continue;
      if (a.type === "theme") {
        themes.set(a.id, { theme: a.name, path: [asset?.name ?? "", a.name] });
      } else if (BRIDGE_TYPES.has(a.type)) {
        for (const n2 of adj.get(n1) ?? []) {
          const b = byId.get(n2);
          if (b?.type === "theme" && !themes.has(b.id)) themes.set(b.id, { theme: b.name, path: [asset?.name ?? "", a.name, b.name] });
        }
      }
    }
    result.set(assetId, themes);
  }
  return result;
}

/** Share of cost basis linked to each theme. Themes overlap, so shares need not sum to 100%. */
export async function exposure(db: Database, userId: string, at?: Date): Promise<Exposure> {
  const holdings = await holdingsAt(db, userId, at);
  const totalCost = holdings.reduce((s, h) => s + h.cost, 0);
  const themeMap = await themesForAssets(db, userId, holdings.map((h) => h.assetId));
  const themes = new Map<string, ThemeExposure>();
  for (const h of holdings) {
    for (const [themeId, t] of themeMap.get(h.assetId) ?? []) {
      const row = themes.get(themeId) ?? { themeId, theme: t.theme, cost: 0, share: 0, assets: [] };
      row.cost += h.cost;
      row.assets.push({ assetId: h.assetId, symbol: h.symbol, name: h.name, cost: h.cost, path: t.path });
      themes.set(themeId, row);
    }
  }
  return {
    at: at ?? new Date(),
    totalCost,
    holdings,
    themes: [...themes.values()]
      .map((t) => ({ ...t, share: totalCost ? t.cost / totalCost : 0 }))
      .sort((a, b) => b.share - a.share || a.theme.localeCompare(b.theme)),
  };
}
