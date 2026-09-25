import { and, asc, desc, eq } from "drizzle-orm";
import type { AIProvider, ChatMessage } from "@jarvis/ai";
import { schema, type Database } from "@jarvis/db";
import type { MemoryService } from "@jarvis/memory";
import type { AskEvent, ContextSource, EntityRef } from "@jarvis/types";

export type RetrievedContext = { sources: ContextSource[]; prompt: string };

type Deps = { db: Database; ai: AIProvider; memory: MemoryService };

const SYSTEM = `You are JARVIS, the user's financial second brain.
You answer from the user's own memory: notes, theses, research, trades, events and the knowledge graph built from them. That context is given to you with reference ids like [M1] for memories and [E1] for graph entities.

Rules:
- Ground every claim in the context and cite it inline with its reference id, e.g. "NVDA is your largest position [M3]".
- If the context does not cover the question, say what is missing and suggest what the user could save. Do not fill gaps with general knowledge presented as the user's data.
- Never invent prices, quantities, returns or market data. Only use numbers that appear in the context.
- Point out connections, contradictions and risks across memories when they are relevant.
- You cannot place trades. You may suggest an action, but say that it would need the user's review and explicit confirmation.
- Be concise: short paragraphs or a few bullets. Plain language.`;

const excerpt = (s: string, n = 420) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

export async function retrieveContext(deps: Deps, userId: string, question: string): Promise<RetrievedContext> {
  const hits = await deps.memory.search(userId, { q: question, mode: "hybrid", limit: 8 });

  // Entities named in the question first, then those attached to the best memories.
  const named = await deps.memory.knowledge.resolve(userId, question);
  const entityRefs = new Map<string, EntityRef>();
  for (const e of named) entityRefs.set(e.id, e);
  for (const h of hits.slice(0, 4)) for (const e of h.memory.entities) if (entityRefs.size < 8) entityRefs.set(e.id, e);

  const sources: ContextSource[] = hits.map((h, i) => ({
    kind: "memory",
    ref: `M${i + 1}`,
    id: h.memory.id,
    title: h.memory.title,
    type: h.memory.type,
    excerpt: excerpt(h.memory.content),
    createdAt: (h.memory.occurredAt ?? h.memory.createdAt).toISOString(),
    score: h.score,
  }));

  let n = 0;
  for (const ref of entityRefs.values()) {
    const details = await deps.memory.knowledge.entityDetails(userId, ref.id);
    if (!details) continue;
    sources.push({
      kind: "entity",
      ref: `E${++n}`,
      id: ref.id,
      name: ref.symbol && ref.type === "asset" ? `${ref.name} (${ref.symbol})` : ref.name,
      type: ref.type,
      relations: details.neighbors
        .slice(0, 8)
        .map((nb) => (nb.direction === "out" ? `${nb.relation} → ${nb.name}` : `${nb.name} ${nb.relation} → this`)),
    });
  }

  const lines = sources.map((s) =>
    s.kind === "memory"
      ? `[${s.ref}] ${s.type.replace("_", " ")} · ${s.createdAt.slice(0, 10)} · "${s.title}"\n${s.excerpt}`
      : `[${s.ref}] ${s.type}: ${s.name}${s.relations.length ? `\n  ${s.relations.join("\n  ")}` : ""}`,
  );
  const prompt = sources.length
    ? `Context from the user's memory:\n\n${lines.join("\n\n")}\n\nQuestion: ${question}`
    : `No saved memory matched this question.\n\nQuestion: ${question}`;
  return { sources, prompt };
}

/**
 * RETRIEVE → REASON → REMEMBER. Streams sources first so the UI can show
 * "Memory used" while the answer is still being written.
 */
export async function* answer(deps: Deps, userId: string, question: string, conversationId?: string): AsyncGenerator<AskEvent> {
  const { db, ai } = deps;
  let convId = conversationId;
  if (convId) {
    const [owned] = await db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(and(eq(schema.conversations.id, convId), eq(schema.conversations.userId, userId)));
    if (!owned) convId = undefined;
  }
  if (!convId) {
    const [c] = await db
      .insert(schema.conversations)
      .values({ userId, title: question.slice(0, 120) })
      .returning();
    convId = c.id;
  }

  const history = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, convId))
    .orderBy(desc(schema.messages.createdAt))
    .limit(6);
  const messages: ChatMessage[] = history
    .reverse()
    .map((m) => ({ role: m.role as ChatMessage["role"], content: m.content }));

  const context = await retrieveContext(deps, userId, question);
  yield { type: "sources", sources: context.sources, provider: ai.name, model: ai.model };

  await db.insert(schema.messages).values({ conversationId: convId, role: "user", content: question });

  let text = "";
  try {
    for await (const chunk of ai.stream({
      system: SYSTEM,
      messages: [...messages, { role: "user", content: context.prompt }],
      context: context.sources,
      maxTokens: 2000,
    })) {
      text += chunk;
      yield { type: "text", text: chunk };
    }
  } catch (error) {
    console.error("AI provider failed", error);
    yield { type: "error", message: "The AI provider did not respond. Your memory is safe; try again." };
    return;
  }

  const [saved] = await db
    .insert(schema.messages)
    .values({ conversationId: convId, role: "assistant", content: text, sources: context.sources, provider: ai.name, model: ai.model })
    .returning();
  await db.update(schema.conversations).set({ updatedAt: new Date() }).where(eq(schema.conversations.id, convId));
  await deps.memory.recordActivity(userId, "asked", "conversation", convId, `Asked: ${question.slice(0, 140)}`);
  yield { type: "done", conversationId: convId, messageId: saved.id };
}

export async function conversationMessages(db: Database, userId: string, conversationId: string) {
  return db
    .select({ id: schema.messages.id, role: schema.messages.role, content: schema.messages.content, sources: schema.messages.sources, createdAt: schema.messages.createdAt })
    .from(schema.messages)
    .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
    .where(and(eq(schema.messages.conversationId, conversationId), eq(schema.conversations.userId, userId)))
    .orderBy(asc(schema.messages.createdAt));
}

/** A short, grounded description of an entity for the graph sidebar. */
export async function summarizeEntity(deps: Deps, userId: string, entityId: string): Promise<{ text: string; offline: boolean } | null> {
  const details = await deps.memory.knowledge.entityDetails(userId, entityId);
  if (!details) return null;
  const { entity, memories, neighbors } = details;
  const byRelation = new Map<string, string[]>();
  for (const n of neighbors) byRelation.set(n.relation, [...(byRelation.get(n.relation) ?? []), n.name]);

  if (!deps.ai.isLanguageModel) {
    const parts = [
      `${entity.name} appears in ${memories.length} ${memories.length === 1 ? "memory" : "memories"} and has ${neighbors.length} connections.`,
      ...[...byRelation].slice(0, 4).map(([rel, names]) => `${rel.replace("_", " ")}: ${[...new Set(names)].slice(0, 5).join(", ")}.`),
      memories[0] ? `Most recent: "${memories[0].title}".` : "",
    ];
    return { text: parts.filter(Boolean).join(" "), offline: true };
  }

  const prompt = [
    `Entity: ${entity.name} (${entity.type})${entity.description ? ` — ${entity.description}` : ""}`,
    `Connections:\n${neighbors.slice(0, 20).map((n) => `- ${n.relation} ${n.direction === "out" ? "→" : "←"} ${n.name} (${n.type})`).join("\n")}`,
    `Memories:\n${memories.slice(0, 8).map((m, i) => `[M${i + 1}] ${m.type} "${m.title}": ${excerpt(m.content, 300)}`).join("\n")}`,
    "Summarize in 2-3 sentences what this entity means in the user's financial world: why it matters to them, what it connects to, and any tension between memories. Cite [M#]. Do not add facts that are not above.",
  ].join("\n\n");
  const result = await deps.ai.complete({ system: SYSTEM, messages: [{ role: "user", content: prompt }], maxTokens: 400 });
  return { text: result.text, offline: false };
}
