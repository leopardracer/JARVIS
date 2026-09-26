import { and, asc, desc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { AIProvider } from "@jarvis/ai";
import { schema, type Database } from "@jarvis/db";
import type { InsightEngine } from "@jarvis/knowledge";
import type { MemoryService } from "@jarvis/memory";
import { createAgentSchema, updateAgentSchema, type AgentCadence, type CreateAgentInput } from "@jarvis/types";
import { HttpError } from "./errors";
import { runResearch, type ResearchRow } from "./research";

export type AgentDeps = { db: Database; ai: AIProvider; memory: MemoryService; insights: InsightEngine };

const { agents, research, users } = schema;
const DAY = 86_400_000;

export const CADENCE_MS: Record<AgentCadence, number> = { daily: DAY, weekly: 7 * DAY };
export const MAX_AGENTS = 10;

export type AgentRow = typeof agents.$inferSelect;

async function owned(db: Database, userId: string, id: string) {
  const [row] = await db.select().from(agents).where(and(eq(agents.id, id), eq(agents.userId, userId)));
  if (!row) throw new HttpError(404, "Agent not found");
  return row;
}

/** A new agent runs on the next scheduler pass, then on its cadence. */
export async function createAgent(db: Database, userId: string, raw: CreateAgentInput, now = new Date()) {
  const input = createAgentSchema.parse(raw);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(agents).where(eq(agents.userId, userId));
  if (Number(n) >= MAX_AGENTS) throw new HttpError(409, `You can keep up to ${MAX_AGENTS} agents. Remove one first.`);
  const [row] = await db.insert(agents).values({ userId, ...input, nextRunAt: now }).returning();
  return row;
}

export async function updateAgent(db: Database, userId: string, id: string, raw: unknown, now = new Date()) {
  const input = updateAgentSchema.parse(raw);
  const current = await owned(db, userId, id);
  const cadence = input.cadence ?? (current.cadence as AgentCadence);
  const reschedule = input.cadence !== undefined || input.enabled === true;
  const [row] = await db
    .update(agents)
    .set({
      ...input,
      ...(reschedule ? { nextRunAt: new Date(Math.max(now.getTime(), (current.lastRunAt?.getTime() ?? 0) + CADENCE_MS[cadence])) } : {}),
    })
    .where(eq(agents.id, id))
    .returning();
  return row;
}

export async function deleteAgent(db: Database, userId: string, id: string) {
  await owned(db, userId, id);
  await db.delete(agents).where(eq(agents.id, id));
}

export async function listAgents(db: Database, userId: string) {
  const rows = await db
    .select({ agent: agents, last: research })
    .from(agents)
    .leftJoin(research, eq(research.id, agents.lastResearchId))
    .where(eq(agents.userId, userId))
    .orderBy(asc(agents.createdAt));
  return rows.map((r) => ({ ...r.agent, last: r.last }));
}

/**
 * Run one agent now. Its question goes through the same research pipeline as
 * a question the user asks, restricted to the user's own memory. When nothing
 * it would use is new since the last run, no brief is saved.
 */
export async function runAgent(deps: AgentDeps, userId: string, id: string, now = new Date()): Promise<ResearchRow> {
  const { db } = deps;
  const agent = await owned(db, userId, id);
  const earlier = await db
    .select({ memoryId: research.memoryId })
    .from(research)
    .where(and(eq(research.agentId, id), isNotNull(research.memoryId)));
  const run = await runResearch(deps, userId, agent.question, {
    agentId: id,
    unchangedSince: agent.lastRunAt,
    ignoreMemoryIds: new Set(earlier.map((e) => e.memoryId!)),
  });
  await db
    .update(agents)
    .set({
      lastRunAt: now,
      nextRunAt: new Date(now.getTime() + CADENCE_MS[agent.cadence as AgentCadence]),
      lastResearchId: run.id,
      lastError: run.status === "failed" ? run.summary : null,
      runCount: sql`${agents.runCount} + 1`,
    })
    .where(eq(agents.id, id));
  return run;
}

export type ScheduledRun = { ran: number; done: number; unchanged: number; failed: number; users: string[] };

/**
 * Run every agent that is due. Each agent is claimed by moving its next run
 * forward before it starts, so two schedulers running at once never run the
 * same agent twice. Users whose agents found something get their graph
 * inference and insights refreshed.
 */
export async function runDueAgents(deps: AgentDeps, opts: { now?: Date; userId?: string; limit?: number; liveOnly?: boolean } = {}): Promise<ScheduledRun> {
  const { db } = deps;
  const now = opts.now ?? new Date();
  const due = await db
    .select({ id: agents.id, userId: agents.userId, cadence: agents.cadence, nextRunAt: agents.nextRunAt })
    .from(agents)
    .innerJoin(users, eq(users.id, agents.userId))
    .where(
      and(
        eq(agents.enabled, true),
        lte(agents.nextRunAt, now),
        opts.userId ? eq(agents.userId, opts.userId) : undefined,
        opts.liveOnly ? eq(users.mode, "live") : undefined,
      ),
    )
    .orderBy(asc(agents.nextRunAt))
    .limit(opts.limit ?? 20);

  const result: ScheduledRun = { ran: 0, done: 0, unchanged: 0, failed: 0, users: [] };
  const changed = new Set<string>();
  for (const a of due) {
    const [claimed] = await db
      .update(agents)
      .set({ nextRunAt: new Date(now.getTime() + CADENCE_MS[a.cadence as AgentCadence]) })
      .where(and(eq(agents.id, a.id), eq(agents.nextRunAt, a.nextRunAt)))
      .returning({ id: agents.id });
    if (!claimed) continue;
    result.ran++;
    try {
      const run = await runAgent(deps, a.userId, a.id, now);
      if (run.status === "done") {
        result.done++;
        changed.add(a.userId);
      }
      else if (run.status === "unchanged") result.unchanged++;
      else result.failed++;
    } catch (error) {
      console.error("Agent run failed", a.id, error);
      result.failed++;
      await db.update(agents).set({ lastError: "The run failed. It will try again on its next turn." }).where(eq(agents.id, a.id));
    }
  }
  // New briefs can change the graph, so inferred edges and insights are refreshed with them.
  for (const userId of changed) await deps.insights.run(userId, now);
  result.users = [...new Set(due.map((d) => d.userId))];
  return result;
}

export async function agentRuns(db: Database, userId: string, agentIds: string[], limit = 20) {
  if (!agentIds.length) return [];
  return db
    .select()
    .from(research)
    .where(and(eq(research.userId, userId), inArray(research.agentId, agentIds)))
    .orderBy(desc(research.createdAt))
    .limit(limit);
}
