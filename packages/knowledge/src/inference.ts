import { and, eq, sql } from "drizzle-orm";
import { schema, type Database } from "@jarvis/db";
import type { EntityRef, EntityType, RelationshipType } from "@jarvis/types";
import { exposure, type Exposure } from "./exposure";

const { entities, relationships, memoryEntities, memories } = schema;

/** Things that exist in the world. Memory nodes (notes, trades, theses) are evidence, not actors. */
const CONCRETE: ReadonlySet<string> = new Set(["asset", "company", "theme", "protocol", "person", "event"]);
/** Relations along which a shock can travel from one thing to another. */
const IMPACT_EDGES: ReadonlySet<string> = new Set(["depends_on", "derived_from", "caused_by", "related_to", "similar_to"]);
/** Pairs compared for similarity: things of the same kind. Events are one-off, so they are not compared. */
const COMPARABLE: ReadonlySet<string> = new Set(["asset", "company", "theme", "protocol", "person"]);

export const SIMILARITY_THRESHOLD = 0.3;
const MAX_HOPS = 3;

type Node = EntityRef & { type: EntityType; metadata?: Record<string, unknown> };
type Edge = { s: string; t: string; type: RelationshipType; weight: number };

export type GraphIndex = {
  nodes: Map<string, Node>;
  edges: Edge[];
  /** Undirected adjacency over stated (not inferred) edges between concrete things. */
  adj: Map<string, { id: string; edge: Edge }[]>;
  /** entity id → ids of the user's own memories that mention it. */
  mentions: Map<string, Set<string>>;
  exposure: Exposure;
  /** asset id → share of cost basis. */
  held: Map<string, number>;
};

export type Similarity = {
  a: Node;
  b: Node;
  score: number;
  shared: Node[];
  coMentions: number;
  /** A stated edge already joins the two. */
  linked: boolean;
  reason: string;
};

export type ImpactStep = { from: Node; to: Node; relation: RelationshipType; forward: boolean };
export type ImpactPath = { target: Node; share: number; steps: ImpactStep[] };
export type ImpactReach = { source: Node; share: number; paths: ImpactPath[]; direct: boolean };

const jaccard = <T>(a: Set<T>, b: Set<T>) => {
  if (!a.size && !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n);
};
const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);
export const nodeLabel = (n: Pick<Node, "type" | "name" | "symbol">) => (n.type === "asset" && n.symbol ? n.symbol : n.name);
const listOf = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
/** The memory a node was created from, for scenario, thesis and research nodes. */
export const originMemory = (n: Pick<Node, "metadata">) => (typeof n.metadata?.memoryId === "string" ? n.metadata.memoryId : null);

const VERB: Record<string, [string, string]> = {
  depends_on: ["depends on", "is depended on by"],
  derived_from: ["is issued by", "issues"],
  caused_by: ["is caused by", "causes"],
  related_to: ["is linked to", "is linked to"],
  similar_to: ["is similar to", "is similar to"],
};

/** "OpenAI depends on NVIDIA, which issues NVDA". */
export function describePath(source: Node | string, steps: ImpactStep[]): string {
  const subject = typeof source === "string" ? source : nodeLabel(source);
  const parts = steps.map((s, i) => `${i ? "which " : ""}${VERB[s.relation]?.[s.forward ? 0 : 1] ?? s.relation.replace("_", " ")} ${nodeLabel(s.to)}`);
  return [subject, parts.join(", ")].filter(Boolean).join(" ");
}

/**
 * Graph inference over the user's own graph: similarity from shared
 * neighbours and shared memories, and impact paths from anything in the graph
 * to what the user holds. Deterministic, no market data, no language model:
 * every result names the edges or memories it rests on.
 */
export class GraphInference {
  constructor(private db: Database) {}

  async index(userId: string, now?: Date): Promise<GraphIndex> {
    const [nodeRows, edgeRows, mentionRows, ex] = await Promise.all([
      this.db.select({ id: entities.id, type: entities.type, name: entities.name, symbol: entities.symbol, metadata: entities.metadata }).from(entities).where(eq(entities.userId, userId)),
      this.db
        .select({ s: relationships.sourceId, t: relationships.targetId, type: relationships.type, weight: relationships.weight })
        .from(relationships)
        .where(and(eq(relationships.userId, userId), eq(relationships.inferred, false))),
      this.db
        .select({ entityId: memoryEntities.entityId, memoryId: memoryEntities.memoryId })
        .from(memoryEntities)
        .innerJoin(memories, eq(memories.id, memoryEntities.memoryId))
        // Notes JARVIS wrote quote many things at once, so they would make everything look alike.
        .where(and(eq(memories.userId, userId), sql`${memoryEntities.role} <> 'subject'`, sql`${memories.source} not like 'jarvis%'`)),
      exposure(this.db, userId, now),
    ]);
    const nodes = new Map(nodeRows.map((n) => [n.id, n as Node]));
    const adj: GraphIndex["adj"] = new Map();
    for (const e of edgeRows) {
      const s = nodes.get(e.s);
      const t = nodes.get(e.t);
      if (!s || !t || !CONCRETE.has(s.type) || !CONCRETE.has(t.type) || !IMPACT_EDGES.has(e.type)) continue;
      adj.set(e.s, [...(adj.get(e.s) ?? []), { id: e.t, edge: e }]);
      adj.set(e.t, [...(adj.get(e.t) ?? []), { id: e.s, edge: e }]);
    }
    const mentions = new Map<string, Set<string>>();
    for (const m of mentionRows) {
      if (!mentions.has(m.entityId)) mentions.set(m.entityId, new Set());
      mentions.get(m.entityId)!.add(m.memoryId);
    }
    const held = new Map(ex.holdings.map((h) => [h.assetId, ex.totalCost ? h.cost / ex.totalCost : 0]));
    return { nodes, edges: edgeRows, adj, mentions, exposure: ex, held };
  }

  /**
   * Pairs of the same kind that look alike: 60% weight on shared neighbours in
   * the graph, 40% on memories that mention both. Only pairs at or above the
   * threshold are returned, strongest first.
   */
  similarities(idx: GraphIndex, opts: { entityId?: string; min?: number } = {}): Similarity[] {
    const min = opts.min ?? SIMILARITY_THRESHOLD;
    const neighbours = (id: string) => new Set((idx.adj.get(id) ?? []).map((n) => n.id));
    const linked = new Set(idx.edges.map((e) => pairKey(e.s, e.t)));
    const candidates = [...idx.nodes.values()].filter((n) => COMPARABLE.has(n.type) && ((idx.adj.get(n.id)?.length ?? 0) > 0 || idx.mentions.has(n.id)));
    const out: Similarity[] = [];
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i];
        const b = candidates[j];
        if (a.type !== b.type) continue;
        if (opts.entityId && a.id !== opts.entityId && b.id !== opts.entityId) continue;
        const na = neighbours(a.id);
        const nb = neighbours(b.id);
        na.delete(b.id);
        nb.delete(a.id);
        const ma = idx.mentions.get(a.id) ?? new Set<string>();
        const mb = idx.mentions.get(b.id) ?? new Set<string>();
        const score = 0.6 * jaccard(na, nb) + 0.4 * jaccard(ma, mb);
        if (score < min) continue;
        const shared = [...na].filter((id) => nb.has(id)).map((id) => idx.nodes.get(id)!).sort((x, y) => Number(y.type === "theme") - Number(x.type === "theme") || x.name.localeCompare(y.name));
        const coMentions = [...ma].filter((id) => mb.has(id)).length;
        const reasons = [
          shared.length
            ? `both connect to ${shared.length > 3 ? `${shared.slice(0, 3).map(nodeLabel).join(", ")} and ${shared.length - 3} more` : listOf(shared.map(nodeLabel))}`
            : "",
          coMentions ? `${coMentions} of your memories mention both` : "",
        ].filter(Boolean);
        const [first, second] = a.name.localeCompare(b.name) <= 0 ? [a, b] : [b, a];
        out.push({
          a: first,
          b: second,
          score: Math.round(score * 1000) / 1000,
          shared,
          coMentions,
          linked: linked.has(pairKey(a.id, b.id)),
          reason: reasons.join("; ").replace(/^./, (c) => c.toUpperCase()),
        });
      }
    }
    return out.sort((x, y) => y.score - x.score || x.a.name.localeCompare(y.a.name));
  }

  /**
   * How something could reach each holding: the shortest chain of stated
   * relations (at most three steps), preferring dependencies and issuers over
   * loose links, and companies over broad themes.
   */
  impactPaths(idx: GraphIndex, sourceId: string): ImpactPath[] {
    const source = idx.nodes.get(sourceId);
    if (!source) return [];
    // Dijkstra: one unit per step, a little more for loose links, and a half-step toll for passing through a theme.
    const cost = new Map<string, number>([[sourceId, 0]]);
    const hops = new Map<string, number>([[sourceId, 0]]);
    const prev = new Map<string, { from: string; edge: Edge }>();
    const queue = [sourceId];
    while (queue.length) {
      queue.sort((a, b) => cost.get(a)! - cost.get(b)!);
      const id = queue.shift()!;
      if (hops.get(id)! >= MAX_HOPS) continue;
      // Paths end at a holding; a shock that reaches NVDA does not travel on through NVDA.
      if (id !== sourceId && idx.held.has(id)) continue;
      const toll = id !== sourceId && idx.nodes.get(id)?.type === "theme" ? 0.5 : 0;
      for (const { id: next, edge } of idx.adj.get(id) ?? []) {
        // A plain "linked to" is weaker evidence of a channel than a dependency or an issuer.
        const c = cost.get(id)! + toll + (edge.type === "related_to" || edge.type === "similar_to" ? 1.25 : 1);
        if (c < (cost.get(next) ?? Infinity)) {
          cost.set(next, c);
          hops.set(next, hops.get(id)! + 1);
          prev.set(next, { from: id, edge });
          if (!queue.includes(next)) queue.push(next);
        }
      }
    }
    const paths: ImpactPath[] = [];
    for (const [assetId, share] of idx.held) {
      if (assetId === sourceId || !prev.has(assetId)) continue;
      const steps: ImpactStep[] = [];
      for (let at = assetId; at !== sourceId; ) {
        const { from, edge } = prev.get(at)!;
        steps.unshift({ from: idx.nodes.get(from)!, to: idx.nodes.get(at)!, relation: edge.type, forward: edge.s === from });
        at = from;
      }
      paths.push({ target: idx.nodes.get(assetId)!, share, steps });
    }
    return paths.sort((a, b) => b.share - a.share || a.steps.length - b.steps.length);
  }

  /** Everything in the graph ranked by how much of the portfolio it can reach. */
  reach(idx: GraphIndex, opts: { types?: EntityType[] } = {}): ImpactReach[] {
    const types = new Set(opts.types ?? ["company", "event", "person", "protocol"]);
    const out: ImpactReach[] = [];
    for (const n of idx.nodes.values()) {
      if (!types.has(n.type) || idx.held.has(n.id)) continue;
      const paths = this.impactPaths(idx, n.id);
      if (!paths.length) continue;
      const share = paths.reduce((s, p) => s + p.share, 0);
      out.push({ source: n, share, paths, direct: paths.some((p) => p.steps.length === 1) });
    }
    return out.sort((a, b) => b.share - a.share || a.source.name.localeCompare(b.source.name));
  }

  /**
   * Rebuild the inferred `similar_to` edges: one for each similar pair that no
   * stated edge joins yet. Stated edges are never touched.
   */
  async refresh(userId: string, now?: Date): Promise<{ edges: number; similarities: Similarity[] }> {
    const idx = await this.index(userId, now);
    const similarities = this.similarities(idx).filter((s) => !s.linked);
    await this.db.delete(relationships).where(and(eq(relationships.userId, userId), eq(relationships.inferred, true)));
    let edges = 0;
    for (const s of similarities) {
      const [row] = await this.db
        .insert(relationships)
        .values({ userId, sourceId: s.a.id, targetId: s.b.id, type: "similar_to", weight: s.score, inferred: true, reason: s.reason, ...(now ? { createdAt: now } : {}) })
        .onConflictDoNothing()
        .returning({ id: relationships.id });
      if (row) edges++;
    }
    return { edges, similarities };
  }
}
