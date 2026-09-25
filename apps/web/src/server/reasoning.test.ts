import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type DatabaseHandle } from "@jarvis/db";
import { HashEmbeddingProvider, MockProvider } from "@jarvis/ai";
import { MemoryService, seedDemo } from "@jarvis/memory";
import type { AskEvent } from "@jarvis/types";
import { answer, conversationMessages, retrieveContext, summarizeEntity } from "./reasoning";

let h: DatabaseHandle;
let deps: { db: DatabaseHandle["db"]; ai: MockProvider; memory: MemoryService };
let userId: string;

beforeAll(async () => {
  h = await createDatabase({ dataDir: "memory://" });
  await h.migrate();
  const ai = new MockProvider();
  const memory = new MemoryService({ db: h.db, ai, embedder: new HashEmbeddingProvider() });
  deps = { db: h.db, ai, memory };
  userId = (await seedDemo(h.db, memory)).userId;
});
afterAll(async () => h?.close());

describe("reasoning", () => {
  it("retrieves memories and graph entities with citable refs", async () => {
    const ctx = await retrieveContext(deps, userId, "What is my thesis on AMD?");
    const memories = ctx.sources.filter((s) => s.kind === "memory");
    expect(memories[0]).toMatchObject({ ref: "M1" });
    expect(memories.some((m) => m.kind === "memory" && m.title === "AMD takes share in inference")).toBe(true);
    expect(ctx.sources.some((s) => s.kind === "entity" && s.name.includes("AMD"))).toBe(true);
    expect(ctx.prompt).toContain("[M1]");
  });

  it("streams sources, then text, then saves the conversation", async () => {
    const events: AskEvent[] = [];
    for await (const e of answer(deps, userId, "What could hurt my chip positions?")) events.push(e);
    expect(events[0].type).toBe("sources");
    expect(events.some((e) => e.type === "text")).toBe(true);
    const done = events.at(-1);
    expect(done?.type).toBe("done");
    if (done?.type !== "done") return;
    const msgs = await conversationMessages(h.db, userId, done.conversationId);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(msgs[1].content).toContain("[M");
  });

  it("does not let one user continue another user's conversation", async () => {
    const events: AskEvent[] = [];
    for await (const e of answer(deps, userId, "BTC?")) events.push(e);
    const done = events.at(-1) as Extract<AskEvent, { type: "done" }>;
    const msgs = await conversationMessages(h.db, "00000000-0000-0000-0000-000000000000", done.conversationId);
    expect(msgs).toHaveLength(0);
  });

  it("summarizes an entity from its graph neighborhood offline", async () => {
    const eth = (await deps.memory.knowledge.listEntities(userId)).find((e) => e.symbol === "ETH")!;
    const s = await summarizeEntity(deps, userId, eth.id);
    expect(s?.offline).toBe(true);
    expect(s?.text).toMatch(/Ether appears in \d+ memories/);
  });
});
