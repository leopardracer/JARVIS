import { and, eq, inArray, sql } from "drizzle-orm";
import { schema, type Database } from "@jarvis/db";
import type { MemoryService } from "@jarvis/memory";
import type { CreateThesisInput, UpdateThesisInput } from "@jarvis/types";
import { createThesisSchema, updateThesisSchema } from "@jarvis/types";
import { HttpError } from "./errors";

type Deps = { db: Database; memory: MemoryService };

const { theses, thesisMemories, thesisAssets, memories, entities } = schema;

export async function ensureAsset(memory: MemoryService, userId: string, symbol: string, name?: string) {
  const known = (await memory.knowledge.listEntities(userId)).find((e) => e.type === "asset" && e.symbol === symbol);
  return known ?? (await memory.knowledge.upsertEntity(userId, { type: "asset", name: name || symbol, symbol }));
}

/** The graph node the memory service created for a memory (thesis, research, trade...). */
async function nodeForMemory(db: Database, userId: string, memoryId: string) {
  const [row] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.userId, userId), sql`${entities.metadata}->>'memoryId' = ${memoryId}`));
  return row?.id ?? null;
}

export async function createThesis(deps: Deps, userId: string, raw: CreateThesisInput) {
  const input = createThesisSchema.parse(raw);
  const { db, memory } = deps;
  const origin = await memory.create(userId, {
    type: "thesis",
    title: input.title,
    content: `${input.statement}${input.symbols.length ? `\n\nAssets: ${input.symbols.map((s) => `$${s}`).join(" ")}` : ""}`,
    tags: ["thesis"],
  });
  const [row] = await db
    .insert(theses)
    .values({ userId, title: input.title, statement: input.statement, stance: input.stance, conviction: input.conviction })
    .returning();
  await db.insert(thesisMemories).values({ thesisId: row.id, memoryId: origin.id, relation: "origin" });
  for (const symbol of input.symbols) {
    const asset = await ensureAsset(memory, userId, symbol);
    await db.insert(thesisAssets).values({ thesisId: row.id, assetEntityId: asset.id }).onConflictDoNothing();
  }
  await memory.recordActivity(userId, "thesis_created", "thesis", row.id, `New ${input.stance} thesis: ${input.title}`);
  return row;
}

async function owned(db: Database, userId: string, id: string) {
  const [row] = await db.select().from(theses).where(and(eq(theses.id, id), eq(theses.userId, userId)));
  if (!row) throw new HttpError(404, "Thesis not found");
  return row;
}

export async function updateThesis(deps: Deps, userId: string, id: string, raw: UpdateThesisInput) {
  const patch = updateThesisSchema.parse(raw);
  const { db, memory } = deps;
  const before = await owned(db, userId, id);
  const { note, ...fields } = patch;
  const [row] = await db.update(theses).set(fields).where(eq(theses.id, id)).returning();
  const changes = [
    fields.conviction !== undefined && fields.conviction !== before.conviction ? `conviction ${before.conviction} → ${fields.conviction}` : null,
    fields.stance && fields.stance !== before.stance ? `stance ${before.stance} → ${fields.stance}` : null,
    fields.status && fields.status !== before.status ? (fields.status === "closed" ? "closed" : "reopened") : null,
  ].filter(Boolean);
  if (changes.length) {
    // A change of mind is itself worth remembering, with the reason when given.
    await memory.create(userId, {
      type: "note",
      title: `Thesis update: ${before.title}`,
      content: `Changed ${changes.join(", ")} on the thesis “${before.title}”.${note ? `\n\nWhy: ${note}` : ""}`,
      tags: ["thesis-update"],
    });
    await memory.recordActivity(userId, "thesis_updated", "thesis", id, `${before.title}: ${changes.join(", ")}`);
  }
  return row;
}

export async function linkEvidence(deps: Deps, userId: string, thesisId: string, memoryId: string, relation: "supports" | "contradicts") {
  const { db, memory } = deps;
  const thesis = await owned(db, userId, thesisId);
  const m = await memory.get(userId, memoryId);
  if (!m) throw new HttpError(404, "Memory not found");
  const [origin] = await db
    .select({ memoryId: thesisMemories.memoryId })
    .from(thesisMemories)
    .where(and(eq(thesisMemories.thesisId, thesisId), eq(thesisMemories.relation, "origin")));
  if (origin?.memoryId === memoryId) throw new HttpError(400, "A thesis cannot be evidence for itself");
  await db
    .insert(thesisMemories)
    .values({ thesisId, memoryId, relation })
    .onConflictDoUpdate({ target: [thesisMemories.thesisId, thesisMemories.memoryId], set: { relation } });

  // Evidence is a graph fact too: memory (or what it mentions) → thesis node.
  const target = origin ? await nodeForMemory(db, userId, origin.memoryId) : null;
  if (target) {
    const source = (await nodeForMemory(db, userId, memoryId)) ?? m.entities[0]?.id;
    if (source) await memory.knowledge.link(userId, source, target, relation, memoryId);
  }
  await memory.recordActivity(userId, "thesis_evidence", "thesis", thesisId, `“${m.title}” ${relation === "supports" ? "supports" : "argues against"} ${thesis.title}`);
}

export async function unlinkEvidence(deps: Deps, userId: string, thesisId: string, memoryId: string) {
  await owned(deps.db, userId, thesisId);
  await deps.db
    .delete(thesisMemories)
    .where(and(eq(thesisMemories.thesisId, thesisId), eq(thesisMemories.memoryId, memoryId), inArray(thesisMemories.relation, ["supports", "contradicts"])));
}

export async function thesisDetail(db: Database, userId: string, id: string) {
  const [row] = await db.select().from(theses).where(and(eq(theses.id, id), eq(theses.userId, userId)));
  if (!row) return null;
  const links = await db
    .select({ relation: thesisMemories.relation, memoryId: memories.id, title: memories.title, type: memories.type, content: memories.content, at: sql<Date>`coalesce(${memories.occurredAt}, ${memories.createdAt})` })
    .from(thesisMemories)
    .innerJoin(memories, eq(memories.id, thesisMemories.memoryId))
    .where(eq(thesisMemories.thesisId, id));
  const assets = await db
    .select({ id: entities.id, symbol: entities.symbol, name: entities.name })
    .from(thesisAssets)
    .innerJoin(entities, eq(entities.id, thesisAssets.assetEntityId))
    .where(eq(thesisAssets.thesisId, id));
  const byDate = (a: { at: Date }, b: { at: Date }) => new Date(b.at).getTime() - new Date(a.at).getTime();
  const updates = await db
    .select({ id: memories.id, title: memories.title, content: memories.content, at: memories.createdAt })
    .from(memories)
    .where(and(eq(memories.userId, userId), eq(memories.title, `Thesis update: ${row.title}`)));
  return {
    ...row,
    assets,
    origin: links.find((l) => l.relation === "origin") ?? null,
    supporting: links.filter((l) => l.relation === "supports").sort(byDate),
    contradicting: links.filter((l) => l.relation === "contradicts").sort(byDate),
    updates: updates.sort(byDate),
  };
}
