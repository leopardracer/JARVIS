import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import type { Database } from "@jarvis/db";
import { schema } from "@jarvis/db";
import {
  slugify,
  type Entity,
  type EntityDetails,
  type EntityRef,
  type EntityType,
  type GraphData,
  type GraphEdge,
  type GraphFilter,
  type GraphNode,
  type RelationshipType,
} from "@jarvis/types";

const { entities, relationships, memoryEntities, memories } = schema;

export type UpsertEntityInput = {
  type: EntityType;
  name: string;
  symbol?: string | null;
  description?: string | null;
  aliases?: string[];
  metadata?: Record<string, unknown>;
};

type EntityRow = typeof entities.$inferSelect;

function toEntity(row: EntityRow): Entity {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    name: row.name,
    slug: row.slug,
    symbol: row.symbol,
    description: row.description,
    metadata: row.metadata,
    createdAt: row.createdAt,
  };
}

export function toRef(e: Pick<Entity, "id" | "type" | "name" | "symbol">): EntityRef {
  return { id: e.id, type: e.type, name: e.name, symbol: e.symbol };
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class KnowledgeService {
  constructor(private db: Database) {}

  async upsertEntity(userId: string, input: UpsertEntityInput): Promise<Entity> {
    const slug = slugify(input.symbol ?? input.name) || slugify(input.name);
    const [row] = await this.db
      .insert(entities)
      .values({
        userId,
        type: input.type,
        name: input.name.trim(),
        slug,
        symbol: input.symbol?.toUpperCase() ?? null,
        description: input.description ?? null,
        aliases: input.aliases ?? [],
        metadata: input.metadata ?? {},
      })
      .onConflictDoUpdate({
        target: [entities.userId, entities.type, entities.slug],
        set: {
          symbol: sql`coalesce(${entities.symbol}, excluded.symbol)`,
          description: sql`coalesce(${entities.description}, excluded.description)`,
          aliases: sql`(select array(select distinct unnest(${entities.aliases} || excluded.aliases)))`,
          updatedAt: new Date(),
        },
      })
      .returning();
    return toEntity(row);
  }

  /** Create an edge, or strengthen it when the same fact is seen again. */
  async link(
    userId: string,
    sourceId: string,
    targetId: string,
    type: RelationshipType,
    memoryId?: string | null,
  ) {
    if (sourceId === targetId) return null;
    const [row] = await this.db
      .insert(relationships)
      .values({ userId, sourceId, targetId, type, memoryId: memoryId ?? null })
      .onConflictDoUpdate({
        target: [
          relationships.userId,
          relationships.sourceId,
          relationships.targetId,
          relationships.type,
        ],
        set: { weight: sql`${relationships.weight} + 1`, updatedAt: new Date() },
      })
      .returning();
    return row;
  }

  async getEntity(userId: string, id: string): Promise<Entity | null> {
    const [row] = await this.db
      .select()
      .from(entities)
      .where(and(eq(entities.userId, userId), eq(entities.id, id)));
    return row ? toEntity(row) : null;
  }

  async listEntities(userId: string): Promise<Entity[]> {
    const rows = await this.db.select().from(entities).where(eq(entities.userId, userId));
    return rows.map(toEntity);
  }

  /** Find known entities mentioned in free text by name, symbol, alias or $CASHTAG. */
  async resolve(userId: string, text: string): Promise<Entity[]> {
    const rows = await this.db.select().from(entities).where(eq(entities.userId, userId));
    const found = new Map<string, EntityRow>();
    for (const row of rows) {
      const names = [row.name, ...(row.aliases ?? [])].filter((n) => n.length >= 2);
      const byName = names.some((n) =>
        new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(n)}([^\\p{L}\\p{N}]|$)`, "iu").test(text),
      );
      // Symbols match case-sensitively so "amd" in prose isn't forced, but $amd is.
      const bySymbol =
        row.symbol &&
        (new RegExp(`(^|[^\\p{L}\\p{N}])\\$?${escapeRegExp(row.symbol)}([^\\p{L}\\p{N}]|$)`, "u").test(
          text,
        ) ||
          new RegExp(`\\$${escapeRegExp(row.symbol)}\\b`, "i").test(text));
      if (byName || bySymbol) found.set(row.id, row);
    }
    return [...found.values()].map(toEntity);
  }

  async graph(userId: string, filter: GraphFilter = {}): Promise<GraphData> {
    const until = filter.until ? new Date(filter.until as string | number | Date) : null;
    const nodeRows = await this.db
      .select({
        id: entities.id,
        type: entities.type,
        name: entities.name,
        symbol: entities.symbol,
        createdAt: entities.createdAt,
        mentions: sql<number>`(select count(*)::int from ${memoryEntities} where ${memoryEntities.entityId} = ${entities.id})`,
      })
      .from(entities)
      .where(
        and(
          eq(entities.userId, userId),
          filter.types?.length ? inArray(entities.type, filter.types) : undefined,
          until ? lte(entities.createdAt, until) : undefined,
        ),
      );

    const ids = new Set(nodeRows.map((n) => n.id));
    const edgeRows = await this.db
      .select()
      .from(relationships)
      .where(
        and(
          eq(relationships.userId, userId),
          until ? lte(relationships.createdAt, until) : undefined,
        ),
      );
    let edges: GraphEdge[] = edgeRows
      .filter((e) => ids.has(e.sourceId) && ids.has(e.targetId))
      .map((e) => ({
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        type: e.type,
        weight: e.weight,
        createdAt: e.createdAt.toISOString(),
      }));

    let nodes: GraphNode[] = nodeRows.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.symbol && n.type === "asset" ? n.symbol : n.name,
      symbol: n.symbol,
      cluster: null,
      degree: 0,
      mentions: Number(n.mentions),
      firstSeen: n.createdAt.toISOString(),
    }));

    if (filter.q) {
      const q = filter.q.toLowerCase();
      const hits = new Set(
        nodes
          .filter((n) => n.label.toLowerCase().includes(q) || n.symbol?.toLowerCase() === q)
          .map((n) => n.id),
      );
      const keep = new Set(hits);
      for (const e of edges) {
        if (hits.has(e.source)) keep.add(e.target);
        if (hits.has(e.target)) keep.add(e.source);
      }
      nodes = nodes.filter((n) => keep.has(n.id));
      edges = edges.filter((e) => keep.has(e.source) && keep.has(e.target));
    }

    return withClusters(nodes, edges);
  }

  async neighborhood(userId: string, entityId: string, depth = 2): Promise<GraphData> {
    const full = await this.graph(userId);
    const adj = new Map<string, string[]>();
    for (const e of full.edges) {
      adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
      adj.set(e.target, [...(adj.get(e.target) ?? []), e.source]);
    }
    const seen = new Set([entityId]);
    let frontier = [entityId];
    for (let d = 0; d < depth; d++) {
      const next: string[] = [];
      for (const id of frontier)
        for (const n of adj.get(id) ?? []) if (!seen.has(n)) (seen.add(n), next.push(n));
      frontier = next;
    }
    const nodes = full.nodes.filter((n) => seen.has(n.id));
    const edges = full.edges.filter((e) => seen.has(e.source) && seen.has(e.target));
    return withClusters(nodes, edges);
  }

  async entityDetails(userId: string, entityId: string): Promise<EntityDetails | null> {
    const entity = await this.getEntity(userId, entityId);
    if (!entity) return null;

    const memRows = await this.db
      .select({ m: memories })
      .from(memoryEntities)
      .innerJoin(memories, eq(memories.id, memoryEntities.memoryId))
      .where(and(eq(memoryEntities.entityId, entityId), eq(memories.userId, userId)))
      .orderBy(sql`${memories.createdAt} desc`)
      .limit(25);

    const edgeRows = await this.db
      .select()
      .from(relationships)
      .where(
        and(
          eq(relationships.userId, userId),
          or(eq(relationships.sourceId, entityId), eq(relationships.targetId, entityId)),
        ),
      );
    const otherIds = [
      ...new Set(edgeRows.map((e) => (e.sourceId === entityId ? e.targetId : e.sourceId))),
    ];
    const others = otherIds.length
      ? await this.db.select().from(entities).where(inArray(entities.id, otherIds))
      : [];
    const byId = new Map(others.map((o) => [o.id, o]));
    const neighbors = edgeRows
      .map((e) => {
        const out = e.sourceId === entityId;
        const other = byId.get(out ? e.targetId : e.sourceId);
        return other
          ? { ...toRef(other), relation: e.type, direction: out ? ("out" as const) : ("in" as const), weight: e.weight }
          : null;
      })
      .filter((n): n is NonNullable<typeof n> => n !== null)
      .sort((a, b) => b.weight - a.weight)
      .map(({ weight: _w, ...n }) => n);

    const ofType = (t: EntityType) =>
      [...new Map(neighbors.filter((n) => n.type === t).map((n) => [n.id, toRef(n)])).values()];

    return {
      entity,
      memories: memRows.map(({ m }) => ({
        id: m.id,
        userId: m.userId,
        type: m.type,
        title: m.title,
        content: m.content,
        source: m.source,
        sourceUrl: m.sourceUrl,
        tags: m.tags,
        occurredAt: m.occurredAt,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
      neighbors,
      relatedAssets: ofType("asset"),
      relatedEvents: ofType("event"),
      relatedTrades: ofType("trade"),
    };
  }
}

/**
 * Assign every node to a cluster: theme nodes anchor clusters, and every other
 * node joins the theme it is most strongly connected to (directly, or through
 * one hop when it has no direct theme link).
 */
export function withClusters(nodes: GraphNode[], edges: GraphEdge[]): GraphData {
  const degree = new Map<string, number>();
  const themeWeight = new Map<string, Map<string, number>>();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const add = (node: string, theme: string, w: number) => {
    const m = themeWeight.get(node) ?? new Map();
    m.set(theme, (m.get(theme) ?? 0) + w);
    themeWeight.set(node, m);
  };
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (t?.type === "theme") add(e.source, t.id, e.weight);
    if (s?.type === "theme") add(e.target, s.id, e.weight);
  }
  // One-hop inheritance for nodes with no direct theme link.
  for (const e of edges) {
    for (const [a, b] of [
      [e.source, e.target],
      [e.target, e.source],
    ]) {
      if (!themeWeight.has(a) && byId.get(a)?.type !== "theme") {
        const via = themeWeight.get(b);
        if (via) for (const [theme, w] of via) add(a, theme, w * 0.25);
      }
    }
  }
  const out = nodes.map((n) => {
    let cluster: string | null = n.type === "theme" ? n.id : null;
    const w = themeWeight.get(n.id);
    if (!cluster && w) cluster = [...w.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return { ...n, degree: degree.get(n.id) ?? 0, cluster };
  });
  const clusters = nodes
    .filter((n) => n.type === "theme")
    .map((n) => ({ id: n.id, label: n.label, size: out.filter((o) => o.cluster === n.id).length }));
  return { nodes: out, edges, clusters };
}
