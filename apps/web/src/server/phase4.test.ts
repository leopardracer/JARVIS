import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ApprovalSigner } from "@jarvis/broker";
import { createDatabase, schema, type DatabaseHandle } from "@jarvis/db";
import { HashEmbeddingProvider, MockProvider, type AIProvider } from "@jarvis/ai";
import { InsightEngine } from "@jarvis/knowledge";
import { MemoryService, seedDemo } from "@jarvis/memory";
import { suggestActions } from "./actions";
import { CADENCE_MS, createAgent, listAgents, runDueAgents, updateAgent, type AgentDeps } from "./agents";
import { buildBriefing, currentBriefing, offlineLede, periodStart } from "./briefing";

let h: DatabaseHandle;
let deps: AgentDeps;
let userId: string;
const DAY = 86_400_000;

beforeAll(async () => {
  h = await createDatabase({ dataDir: "memory://" });
  await h.migrate();
  const ai = new MockProvider();
  const memory = new MemoryService({ db: h.db, ai, embedder: new HashEmbeddingProvider(), llmExtraction: false });
  deps = { db: h.db, ai, memory, insights: new InsightEngine(h.db) };
  userId = (await seedDemo(h.db, memory)).userId;
  await suggestActions({ ...deps, signer: new ApprovalSigner(randomBytes(32)) }, userId);
});
afterAll(async () => h?.close());

describe("research agents", () => {
  it("run when due, stay quiet when nothing changed, and pick up new memories", async () => {
    // Two days ago: after every seeded memory, so a rerun has nothing new until one is added.
    const t0 = new Date(Date.now() - 2 * DAY);
    const agent = await createAgent(h.db, userId, { name: "Export watch", question: "What could hurt my chip positions if export rules tighten?", cadence: "daily" }, t0);
    expect(agent.nextRunAt.getTime()).toBe(t0.getTime());

    const first = await runDueAgents(deps, { now: t0, userId });
    expect(first).toMatchObject({ ran: 1, done: 1 });
    const [a1] = await listAgents(h.db, userId);
    expect(a1.last).toMatchObject({ status: "done", agentId: agent.id });
    expect(a1.nextRunAt.getTime()).toBe(t0.getTime() + CADENCE_MS.daily);
    const note = await deps.memory.get(userId, a1.last!.memoryId!);
    expect(note).toMatchObject({ type: "research", source: "jarvis-agent" });

    // Not due again until tomorrow.
    expect((await runDueAgents(deps, { now: new Date(t0.getTime() + DAY / 2), userId })).ran).toBe(0);

    const t1 = new Date(t0.getTime() + CADENCE_MS.daily);
    const second = await runDueAgents(deps, { now: t1, userId });
    expect(second).toMatchObject({ ran: 1, unchanged: 1 });
    expect((await listAgents(h.db, userId))[0].last?.summary).toMatch(/No new memories on this since/);

    await deps.memory.create(userId, { type: "market_event", title: "Chip export rules tightened", content: "Scenario: the export rules on advanced chips now apply to more regions. NVIDIA and Advanced Micro Devices both flagged lower sales.", tags: ["risk"] });
    const t2 = new Date(Date.now() + CADENCE_MS.daily);
    const third = await runDueAgents(deps, { now: t2, userId });
    expect(third).toMatchObject({ ran: 1, done: 1 });
  });

  it("never runs a disabled agent and never runs one agent twice for the same turn", async () => {
    const now = new Date(Date.now() + 30 * DAY);
    const a = await createAgent(h.db, userId, { name: "Crypto cap", question: "Is crypto still inside my 15% cap?", cadence: "daily" }, now);
    await updateAgent(h.db, userId, a.id, { enabled: false }, now);
    await runDueAgents(deps, { now, userId });
    expect((await listAgents(h.db, userId)).find((x) => x.id === a.id)).toMatchObject({ lastRunAt: null, runCount: 0 });

    await h.db.update(schema.agents).set({ enabled: true, nextRunAt: now }).where(eq(schema.agents.id, a.id));
    const [x, y] = await Promise.all([runDueAgents(deps, { now, userId }), runDueAgents(deps, { now, userId })]);
    expect(x.ran + y.ran).toBe(1);
  });

  it("skips demo workspaces when the scheduler runs for everyone", async () => {
    const [agent] = await listAgents(h.db, userId);
    await h.db.update(schema.agents).set({ nextRunAt: new Date(0) }).where(eq(schema.agents.id, agent.id));
    expect((await runDueAgents(deps, { liveOnly: true })).ran).toBe(0);
  });
});

describe("briefings", () => {
  it("puts decisions first and orders by what the user holds and writes about", async () => {
    const b = await buildBriefing(deps, userId, "weekly");
    const keys = b.sections.map((s) => s.key);
    expect(keys[0]).toBe("decisions");
    const decisions = b.sections[0].items.map((i) => i.text);
    expect(decisions[0]).toBe("Review SELL 8.27 NVDA");
    expect(decisions).toContain("“AMD takes share in inference” has more evidence against than for");
    const changes = b.sections.find((s) => s.key === "changes")!.items.map((i) => i.text);
    expect(changes).toContain("Sold 0.004 BTC (demo)");
    expect(b.sections.find((s) => s.key === "agents")!.items.length).toBeGreaterThan(0);
    expect(b.lede).toMatch(/^This week: 3 things need your decision, starting with: Review SELL 8.27 NVDA\. Most important change: .+ You made 1 trade\./);
    expect(b.provider).toBeNull();
  });

  it("keeps one briefing per period and reuses it while fresh", async () => {
    const now = new Date();
    const a = await currentBriefing(deps, userId, "daily", now);
    const b = await currentBriefing(deps, userId, "daily", new Date(now.getTime() + 60_000));
    expect(b.id).toBe(a.id);
    expect(b.updatedAt.getTime()).toBe(a.updatedAt.getTime());
    expect(periodStart("weekly", new Date("2026-09-26T15:00:00Z")).toISOString()).toBe("2026-09-21T00:00:00.000Z");
    expect(periodStart("daily", new Date("2026-09-26T15:00:00Z")).toISOString()).toBe("2026-09-26T00:00:00.000Z");
  });

  it("says a quiet day is quiet, and lets a language model write only from the items", async () => {
    expect(offlineLede([], "daily")).toBe("Today was quiet: nothing changed in your memory, portfolio or graph.");
    let prompt = "";
    const model = {
      ...new MockProvider(),
      name: "anthropic",
      model: "test-model",
      isLanguageModel: true,
      complete: async (req: { messages: { content: string }[] }) => {
        prompt = req.messages[0].content;
        return { text: "Review the NVDA trim first." };
      },
    } as unknown as AIProvider;
    const b = await buildBriefing({ db: h.db, ai: model }, userId, "weekly");
    expect(b).toMatchObject({ lede: "Review the NVDA trim first.", provider: "anthropic", model: "test-model" });
    expect(prompt).toContain("Needs your decision:\n- Review SELL 8.27 NVDA");
  });
});
