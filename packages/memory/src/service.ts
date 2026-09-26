import { and, arrayOverlaps, cosineDistance, desc, eq, gte, inArray, lt, lte, ne, or, sql } from "drizzle-orm";
import { padVector, type AIProvider, type EmbeddingProvider } from "@jarvis/ai";
import { schema, VECTOR_DIMENSIONS, type Database } from "@jarvis/db";
import { KnowledgeService, toRef } from "@jarvis/knowledge";
import {
  createMemorySchema,
  memoryFilterSchema,
  searchQuerySchema,
  updateMemorySchema,
  type CreateMemoryInput,
  type Entity,
  type EntityRef,
  type EntityType,
  type Memory,
  type MemoryFilter,
  type MemoryType,
  type MemoryWithEntities,
  type Page,
  type RelationshipType,
  type SearchHit,
  type SearchQuery,
  type UpdateMemoryInput,
} from "@jarvis/types";
import { llmExtraction, ruleBasedExtraction, type Extraction } from "./extract";

const { memories, memoryEntities, entities, relationships, embeddings, activities } = schema;
type MemoryRow = typeof memories.$inferSelect;

/** Memory types that also become a node in the graph, and how mentioned entities relate to that node. */
const MEMORY_NODES: Partial<Record<MemoryType, { type: EntityType; relation: RelationshipType }>> = {
  thesis: { type: "thesis", relation: "supports" },
  research: { type: "research", relation: "mentioned_in" },
  document: { type: "document", relation: "mentioned_in" },
  trade: { type: "trade", relation: "involved_in" },
  market_event: { type: "event", relation: "related_to" },
  idea: { type: "idea", relation: "related_to" },
};

export type MemoryServiceOptions = {
  db: Database;
  ai: AIProvider;
  embedder: EmbeddingProvider;
  /** Run LLM entity extraction on capture (default: when a language model is configured). */
  llmExtraction?: boolean;
  onWarning?: (message: string, error: unknown) => void;
};

function toMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    title: row.title,
    content: row.content,
    source: row.source,
    sourceUrl: row.sourceUrl,
    tags: row.tags,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function encodeCursor(row: { createdAt: Date; id: string }) {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString("base64url");
}

function decodeCursor(cursor: string) {
  const [iso, id] = Buffer.from(cursor, "base64url").toString().split("|");
  const date = new Date(iso);
  if (!id || Number.isNaN(date.getTime())) throw new Error("Invalid cursor");
  return { createdAt: date, id };
}

export class MemoryService {
  readonly knowledge: KnowledgeService;
  private db: Database;
  private ai: AIProvider;
  private embedder: EmbeddingProvider;
  private useLlm: boolean;
  private warn: (message: string, error: unknown) => void;

  constructor(opts: MemoryServiceOptions) {
    this.db = opts.db;
    this.ai = opts.ai;
    this.embedder = opts.embedder;
    this.knowledge = new KnowledgeService(opts.db);
    this.useLlm = opts.llmExtraction ?? opts.ai.isLanguageModel;
    this.warn = opts.onWarning ?? ((m, e) => console.warn(m, e));
  }

  get embeddingModel() {
    return this.embedder.model;
  }

  // ---------- Capture ----------

  async create(userId: string, input: CreateMemoryInput): Promise<MemoryWithEntities> {
    const data = createMemorySchema.parse(input);
    const [row] = await this.db
      .insert(memories)
      .values({ userId, ...data, sourceUrl: data.sourceUrl ?? null, occurredAt: data.occurredAt ?? null })
      .returning();
    const linked = await this.connect(userId, row);
    await this.embed(userId, [row]);
    await this.recordActivity(userId, "memory_created", "memory", row.id, `Saved ${row.type.replace("_", " ")}: ${row.title}`);
    return { ...toMemory(row), entities: linked };
  }

  async update(userId: string, id: string, patch: UpdateMemoryInput): Promise<MemoryWithEntities | null> {
    const data = updateMemorySchema.parse(patch);
    const [row] = await this.db
      .update(memories)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(memories.userId, userId), eq(memories.id, id)))
      .returning();
    if (!row) return null;
    if (data.title !== undefined || data.content !== undefined || data.type !== undefined) {
      await this.db.delete(memoryEntities).where(eq(memoryEntities.memoryId, id));
      await this.db.delete(relationships).where(eq(relationships.memoryId, id));
      await this.connect(userId, row);
      await this.embed(userId, [row]);
    }
    await this.recordActivity(userId, "memory_updated", "memory", row.id, `Updated ${row.title}`);
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(memories)
      .where(and(eq(memories.userId, userId), eq(memories.id, id)))
      .returning({ id: memories.id, title: memories.title });
    if (deleted.length) {
      await this.recordActivity(userId, "memory_deleted", "memory", null, `Deleted ${deleted[0].title}`);
    }
    return deleted.length > 0;
  }

  /** Extract entities, link them to the memory and to each other. */
  private async connect(userId: string, row: MemoryRow): Promise<EntityRef[]> {
    const text = `${row.title}\n${row.content}`;
    const known = await this.knowledge.resolve(userId, text);
    let extraction: Extraction = ruleBasedExtraction(text);
    if (this.useLlm) {
      try {
        const llm = await llmExtraction(this.ai, row.title, row.content);
        extraction = {
          entities: [...extraction.entities, ...llm.entities],
          relations: llm.relations,
        };
      } catch (error) {
        this.warn("LLM entity extraction failed; using rule-based extraction only", error);
      }
    }

    const byName = new Map<string, Entity>();
    for (const e of known) byName.set(e.name.toLowerCase(), e);
    for (const e of extraction.entities) {
      const existing =
        byName.get(e.name.toLowerCase()) ??
        known.find((k) => k.symbol && e.symbol && k.symbol === e.symbol.toUpperCase());
      if (existing) {
        byName.set(e.name.toLowerCase(), existing);
        continue;
      }
      const created = await this.knowledge.upsertEntity(userId, e);
      byName.set(e.name.toLowerCase(), created);
    }
    const mentioned = [...new Map([...byName.values()].map((e) => [e.id, e])).values()];

    if (mentioned.length) {
      await this.db
        .insert(memoryEntities)
        .values(mentioned.map((e) => ({ memoryId: row.id, entityId: e.id })))
        .onConflictDoNothing();
    }

    // Explicit relations from the extractor.
    for (const r of extraction.relations) {
      const s = byName.get(r.source.toLowerCase());
      const t = byName.get(r.target.toLowerCase());
      if (s && t) await this.knowledge.link(userId, s.id, t.id, r.type, row.id);
    }

    // A memory that is itself a graph object (thesis, trade, research...) gets a node.
    const node = MEMORY_NODES[row.type];
    if (node) {
      const self = await this.knowledge.upsertEntity(userId, {
        type: node.type,
        name: row.title,
        metadata: { memoryId: row.id },
      });
      await this.db
        .insert(memoryEntities)
        .values({ memoryId: row.id, entityId: self.id, role: "subject" })
        .onConflictDoNothing();
      for (const e of mentioned) {
        if (e.id !== self.id) await this.knowledge.link(userId, e.id, self.id, node.relation, row.id);
      }
    } else if (!extraction.relations.length) {
      // Co-mentions in a plain note become weak related_to edges.
      const nonThemes = mentioned.filter((e) => e.type !== "theme");
      const themes = mentioned.filter((e) => e.type === "theme");
      for (const e of nonThemes) for (const t of themes) await this.knowledge.link(userId, e.id, t.id, "related_to", row.id);
      for (let i = 0; i < nonThemes.length; i++)
        for (let j = i + 1; j < nonThemes.length; j++)
          await this.knowledge.link(userId, nonThemes[i].id, nonThemes[j].id, "related_to", row.id);
    }

    return mentioned.map(toRef);
  }

  /** Compute and store embeddings. Failures are logged; exact search keeps working. */
  async embed(userId: string, rows: Pick<MemoryRow, "id" | "title" | "content">[]) {
    if (!rows.length) return;
    try {
      const vectors = await this.embedder.embed(rows.map((r) => `${r.title}\n\n${r.content}`));
      await this.db
        .insert(embeddings)
        .values(
          rows.map((r, i) => ({
            memoryId: r.id,
            userId,
            model: this.embedder.model,
            dimensions: vectors[i].length,
            vector: padVector(vectors[i], VECTOR_DIMENSIONS),
          })),
        )
        .onConflictDoUpdate({
          target: [embeddings.memoryId, embeddings.model],
          set: { vector: sql`excluded.vector`, dimensions: sql`excluded.dimensions`, createdAt: new Date() },
        });
    } catch (error) {
      this.warn("Embedding failed; semantic search will skip these memories", error);
    }
  }

  // ---------- Read ----------

  async get(userId: string, id: string): Promise<MemoryWithEntities | null> {
    const [row] = await this.db
      .select()
      .from(memories)
      .where(and(eq(memories.userId, userId), eq(memories.id, id)));
    if (!row) return null;
    const [withEntities] = await this.attachEntities([toMemory(row)]);
    return withEntities;
  }

  async list(userId: string, filter: MemoryFilter = {}): Promise<Page<MemoryWithEntities>> {
    const f = memoryFilterSchema.parse(filter);
    const cursor = f.cursor ? decodeCursor(f.cursor) : null;
    const rows = await this.db
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.userId, userId),
          f.types?.length ? inArray(memories.type, f.types) : undefined,
          f.tags?.length ? arrayOverlaps(memories.tags, f.tags) : undefined,
          f.from ? gte(memories.createdAt, f.from) : undefined,
          f.to ? lte(memories.createdAt, f.to) : undefined,
          f.entityIds?.length
            ? inArray(
                memories.id,
                this.db
                  .select({ id: memoryEntities.memoryId })
                  .from(memoryEntities)
                  .where(inArray(memoryEntities.entityId, f.entityIds)),
              )
            : undefined,
          cursor
            ? or(
                lt(memories.createdAt, cursor.createdAt),
                and(eq(memories.createdAt, cursor.createdAt), lt(memories.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(memories.createdAt), desc(memories.id))
      .limit(f.limit + 1);
    const page = rows.slice(0, f.limit);
    return {
      items: await this.attachEntities(page.map(toMemory)),
      nextCursor: rows.length > f.limit ? encodeCursor(page[page.length - 1]) : null,
    };
  }

  async search(userId: string, query: SearchQuery): Promise<SearchHit[]> {
    const q = searchQuerySchema.parse(query);
    const typeFilter = q.types?.length ? inArray(memories.type, q.types) : undefined;
    const pool = Math.max(q.limit * 3, 20);

    const text = q.mode === "semantic" ? [] : await this.textSearch(userId, q.q, pool, typeFilter);
    const vector = q.mode === "exact" ? [] : await this.vectorSearch(userId, q.q, pool, typeFilter);
    const entity = q.mode === "exact" ? [] : await this.entitySearch(userId, q.q, pool, typeFilter);

    // Reciprocal rank fusion across the signals.
    const K = 60;
    const scores = new Map<string, { score: number; matchedBy: Set<SearchHit["matchedBy"][number]> }>();
    const addList = (ids: string[], signal: SearchHit["matchedBy"][number], weight = 1) =>
      ids.forEach((id, rank) => {
        const cur = scores.get(id) ?? { score: 0, matchedBy: new Set() };
        cur.score += weight / (K + rank + 1);
        cur.matchedBy.add(signal);
        scores.set(id, cur);
      });
    addList(text, "text");
    addList(vector, "vector");
    addList(entity, "entity", 0.8);

    const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, q.limit);
    if (!ranked.length) return [];
    const rows = await this.db
      .select()
      .from(memories)
      .where(and(eq(memories.userId, userId), inArray(memories.id, ranked.map(([id]) => id))));
    const withEntities = new Map(
      (await this.attachEntities(rows.map(toMemory))).map((m) => [m.id, m]),
    );
    const top = ranked[0][1].score;
    return ranked
      .filter(([id]) => withEntities.has(id))
      .map(([id, s]) => ({
        memory: withEntities.get(id)!,
        score: Number((s.score / top).toFixed(4)),
        matchedBy: [...s.matchedBy],
      }));
  }

  private async textSearch(userId: string, q: string, limit: number, typeFilter: ReturnType<typeof inArray> | undefined) {
    const tsq = sql`websearch_to_tsquery('english', ${q})`;
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const rows = await this.db
      .select({ id: memories.id })
      .from(memories)
      .where(
        and(
          eq(memories.userId, userId),
          typeFilter,
          or(sql`${memories.search} @@ ${tsq}`, sql`${memories.title} ilike ${like}`, sql`${memories.content} ilike ${like}`),
        ),
      )
      .orderBy(
        sql`ts_rank_cd(${memories.search}, ${tsq}) + case when ${memories.title} ilike ${like} then 0.5 else 0 end desc`,
        desc(memories.createdAt),
      )
      .limit(limit);
    return rows.map((r) => r.id);
  }

  private async vectorSearch(userId: string, q: string, limit: number, typeFilter: ReturnType<typeof inArray> | undefined) {
    let vec: number[];
    try {
      [vec] = await this.embedder.embed([q]);
    } catch (error) {
      this.warn("Query embedding failed; falling back to text search", error);
      return [];
    }
    const distance = cosineDistance(embeddings.vector, padVector(vec, VECTOR_DIMENSIONS));
    const rows = await this.db
      .select({ id: embeddings.memoryId, distance })
      .from(embeddings)
      .innerJoin(memories, eq(memories.id, embeddings.memoryId))
      .where(and(eq(embeddings.userId, userId), eq(embeddings.model, this.embedder.model), typeFilter))
      .orderBy(distance)
      .limit(limit);
    // Drop matches that are essentially unrelated.
    return rows.filter((r) => Number(r.distance) < 0.95).map((r) => r.id);
  }

  private async entitySearch(userId: string, q: string, limit: number, typeFilter: ReturnType<typeof inArray> | undefined) {
    const found = await this.knowledge.resolve(userId, q);
    if (!found.length) return [];
    const rows = await this.db
      .select({ id: memories.id, hits: sql<number>`count(*)::int` })
      .from(memoryEntities)
      .innerJoin(memories, eq(memories.id, memoryEntities.memoryId))
      .where(
        and(
          eq(memories.userId, userId),
          typeFilter,
          inArray(memoryEntities.entityId, found.map((e) => e.id)),
        ),
      )
      .groupBy(memories.id, memories.createdAt)
      .orderBy(sql`count(*) desc`, desc(memories.createdAt))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  /** Memories close in embedding space or sharing entities with the given one. */
  async related(userId: string, id: string, limit = 6): Promise<SearchHit[]> {
    const [emb] = await this.db
      .select({ vector: embeddings.vector })
      .from(embeddings)
      .where(and(eq(embeddings.memoryId, id), eq(embeddings.model, this.embedder.model)));

    const byVector: string[] = [];
    if (emb) {
      const distance = cosineDistance(embeddings.vector, emb.vector);
      const rows = await this.db
        .select({ id: embeddings.memoryId, distance })
        .from(embeddings)
        .where(and(eq(embeddings.userId, userId), eq(embeddings.model, this.embedder.model), ne(embeddings.memoryId, id)))
        .orderBy(distance)
        .limit(limit * 2);
      byVector.push(...rows.filter((r) => Number(r.distance) < 0.9).map((r) => r.id));
    }

    const shared = await this.db
      .select({ id: memoryEntities.memoryId, n: sql<number>`count(*)::int` })
      .from(memoryEntities)
      .where(
        and(
          ne(memoryEntities.memoryId, id),
          inArray(
            memoryEntities.entityId,
            this.db.select({ e: memoryEntities.entityId }).from(memoryEntities).where(eq(memoryEntities.memoryId, id)),
          ),
        ),
      )
      .groupBy(memoryEntities.memoryId)
      .orderBy(sql`count(*) desc`)
      .limit(limit * 2);

    const K = 60;
    const scores = new Map<string, { score: number; matchedBy: Set<"vector" | "entity"> }>();
    byVector.forEach((m, r) => {
      const s = scores.get(m) ?? { score: 0, matchedBy: new Set() };
      s.score += 1 / (K + r + 1);
      s.matchedBy.add("vector");
      scores.set(m, s);
    });
    shared.forEach(({ id: m }, r) => {
      const s = scores.get(m) ?? { score: 0, matchedBy: new Set() };
      s.score += 1 / (K + r + 1);
      s.matchedBy.add("entity");
      scores.set(m, s);
    });
    const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, limit);
    if (!ranked.length) return [];
    const rows = await this.db
      .select()
      .from(memories)
      .where(and(eq(memories.userId, userId), inArray(memories.id, ranked.map(([m]) => m))));
    const map = new Map((await this.attachEntities(rows.map(toMemory))).map((m) => [m.id, m]));
    const top = ranked[0][1].score;
    return ranked
      .filter(([m]) => map.has(m))
      .map(([m, s]) => ({ memory: map.get(m)!, score: s.score / top, matchedBy: [...s.matchedBy] }));
  }

  async attachEntities(items: Memory[]): Promise<MemoryWithEntities[]> {
    if (!items.length) return [];
    const links = await this.db
      .select({ memoryId: memoryEntities.memoryId, id: entities.id, type: entities.type, name: entities.name, symbol: entities.symbol, role: memoryEntities.role })
      .from(memoryEntities)
      .innerJoin(entities, eq(entities.id, memoryEntities.entityId))
      .where(inArray(memoryEntities.memoryId, items.map((m) => m.id)));
    return items.map((m) => ({
      ...m,
      entities: links
        .filter((l) => l.memoryId === m.id && l.role !== "subject")
        .map((l) => ({ id: l.id, type: l.type, name: l.name, symbol: l.symbol })),
    }));
  }

  async recordActivity(userId: string, kind: string, subjectType: string | null, subjectId: string | null, summary: string) {
    await this.db.insert(activities).values({ userId, kind, subjectType, subjectId, summary });
  }

  async recentActivity(userId: string, limit = 20) {
    return this.db
      .select()
      .from(activities)
      .where(eq(activities.userId, userId))
      .orderBy(desc(activities.createdAt))
      .limit(limit);
  }

  async stats(userId: string) {
    const [m] = await this.db.select({ n: sql<number>`count(*)::int` }).from(memories).where(eq(memories.userId, userId));
    const [e] = await this.db.select({ n: sql<number>`count(*)::int` }).from(entities).where(eq(entities.userId, userId));
    const [r] = await this.db.select({ n: sql<number>`count(*)::int` }).from(relationships).where(and(eq(relationships.userId, userId), eq(relationships.inferred, false)));
    return { memories: Number(m.n), entities: Number(e.n), relationships: Number(r.n) };
  }
}
