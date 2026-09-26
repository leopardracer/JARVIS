import { and, eq } from "drizzle-orm";
import { schema } from "@jarvis/db";
import { runDueAgents, type AgentDeps } from "./agents";
import { buildBriefing } from "./briefing";

const LAZY_INTERVAL_MS = 10 * 60_000;
const lastCatchUp = new Map<string, number>();

/**
 * One scheduler pass for every live account: run due agents, then refresh
 * the daily briefing of each account that has agents. Demo workspaces are
 * left alone; they catch up when someone opens them.
 */
export async function runScheduled(deps: AgentDeps, now = new Date()) {
  const agents = await runDueAgents(deps, { now, liveOnly: true, limit: 50 });
  const owners = await deps.db
    .selectDistinct({ userId: schema.agents.userId })
    .from(schema.agents)
    .innerJoin(schema.users, eq(schema.users.id, schema.agents.userId))
    .where(and(eq(schema.users.mode, "live"), eq(schema.agents.enabled, true)));
  let briefings = 0;
  for (const { userId } of owners) {
    await buildBriefing(deps, userId, "daily", now);
    briefings++;
  }
  return { agents, briefings, at: now.toISOString() };
}

/**
 * Catch-up for one account when its owner opens JARVIS: run the agents whose
 * turn has passed. This keeps agents working on a single-user install with no
 * scheduler configured. At most once every ten minutes per account.
 */
export async function catchUp(deps: AgentDeps, userId: string, now = new Date()) {
  if (now.getTime() - (lastCatchUp.get(userId) ?? 0) < LAZY_INTERVAL_MS) return null;
  lastCatchUp.set(userId, now.getTime());
  return runDueAgents(deps, { now, userId, limit: 5 });
}

