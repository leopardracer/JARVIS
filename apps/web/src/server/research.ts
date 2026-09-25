import { and, eq } from "drizzle-orm";
import type { AIProvider } from "@jarvis/ai";
import { schema, type Database } from "@jarvis/db";
import type { MemoryService } from "@jarvis/memory";
import type { ContextSource } from "@jarvis/types";
import { retrieveContext } from "./reasoning";

type Deps = { db: Database; ai: AIProvider; memory: MemoryService };

export type ResearchRow = typeof schema.research.$inferSelect;

const SYSTEM = `You are JARVIS, the user's financial second brain, writing a research brief.
You work only from the user's own memory, given with reference ids like [M1] and [E1].

Write the brief in this shape, in plain language:
Findings: 2-4 bullets that answer the question, each citing its source ids.
Against: the strongest evidence in the memory that cuts the other way, cited. Say "None saved" if there is none.
Gaps: what the memory does not cover that would change the answer, as questions the user could research next.

Never invent prices, figures or events that are not in the context. Do not give personal investment advice.`;

const firstSentence = (s: string) => (s.match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim();

/** Without a language model the brief is extractive: what each source says, verbatim. */
function offlineBrief(sources: ContextSource[]): string {
  const mems = sources.filter((s) => s.kind === "memory");
  const ents = sources.filter((s) => s.kind === "entity");
  return [
    "Findings (offline mode: quoted from your memory, not reasoned):",
    ...mems.slice(0, 6).map((m) => `- [${m.ref}] ${m.title} (${m.createdAt.slice(0, 10)}): ${firstSentence(m.excerpt)}`),
    ...(ents.length ? ["", "Connected in your graph:", ...ents.slice(0, 4).map((e) => `- [${e.ref}] ${e.name}: ${e.relations.slice(0, 3).join("; ") || "no links yet"}`)] : []),
    "",
    "Gaps: connect an AI provider to get a reasoned brief with evidence against and open questions.",
  ].join("\n");
}

/**
 * RETRIEVE → REASON → REMEMBER for a research question. The brief is stored
 * on the research row and saved back into memory as a research note, so the
 * next question can build on it.
 */
export async function runResearch(deps: Deps, userId: string, query: string): Promise<ResearchRow> {
  const { db, ai, memory } = deps;
  const [row] = await db
    .insert(schema.research)
    .values({ userId, query, status: "running", provider: ai.name, model: ai.model })
    .returning();

  try {
    const context = await retrieveContext(deps, userId, query);
    const mems = context.sources.filter((s) => s.kind === "memory");
    const sources = mems.map((m) => ({ ref: m.ref, title: m.title, memoryId: m.id }));

    if (!mems.length) {
      const [done] = await db
        .update(schema.research)
        .set({ status: "done", summary: "Nothing in your memory covers this question yet. Save notes, research or trades about it and run it again.", sources: [] })
        .where(eq(schema.research.id, row.id))
        .returning();
      return done;
    }

    const summary = ai.isLanguageModel
      ? (
          await ai.complete({
            system: SYSTEM,
            messages: [{ role: "user", content: context.prompt }],
            context: context.sources,
            maxTokens: 1500,
          })
        ).text.trim()
      : offlineBrief(context.sources);

    const note = await memory.create(userId, {
      type: "research",
      title: `Research: ${query.slice(0, 180)}`,
      content: `${summary}\n\nSources:\n${sources.map((s) => `[${s.ref}] ${s.title}`).join("\n")}`,
      source: "jarvis-research",
      tags: ["research"],
    });
    const [done] = await db
      .update(schema.research)
      .set({ status: "done", summary, sources, memoryId: note.id })
      .where(eq(schema.research.id, row.id))
      .returning();
    await memory.recordActivity(userId, "research", "research", row.id, `Researched: ${query.slice(0, 140)}`);
    return done;
  } catch (error) {
    console.error("Research run failed", error);
    const [failed] = await db
      .update(schema.research)
      .set({ status: "failed", summary: "The AI provider did not respond. Nothing was saved; try again." })
      .where(and(eq(schema.research.id, row.id), eq(schema.research.userId, userId)))
      .returning();
    return failed;
  }
}
