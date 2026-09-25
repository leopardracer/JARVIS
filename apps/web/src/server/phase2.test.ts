import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDatabase, schema, type DatabaseHandle } from "@jarvis/db";
import { HashEmbeddingProvider, MockProvider } from "@jarvis/ai";
import { InsightEngine } from "@jarvis/knowledge";
import { MemoryService, seedDemo } from "@jarvis/memory";
import { runResearch } from "./research";
import { createThesis, linkEvidence, thesisDetail, unlinkEvidence, updateThesis } from "./theses";
import { activityView, thesesView, watchlistView } from "./queries";

let h: DatabaseHandle;
let deps: { db: DatabaseHandle["db"]; ai: MockProvider; memory: MemoryService };
let userId: string;

beforeAll(async () => {
  h = await createDatabase({ dataDir: "memory://" });
  await h.migrate();
  const ai = new MockProvider();
  const memory = new MemoryService({ db: h.db, ai, embedder: new HashEmbeddingProvider(), llmExtraction: false });
  deps = { db: h.db, ai, memory };
  userId = (await seedDemo(h.db, memory)).userId;
});
afterAll(async () => h?.close());

describe("research runs", () => {
  it("writes a cited brief from memory and saves it back as a research note", async () => {
    const row = await runResearch(deps, userId, "What could break the AMD thesis?");
    expect(row.status).toBe("done");
    expect(row.provider).toBe("mock");
    expect(row.summary).toContain("offline mode");
    expect(row.sources.length).toBeGreaterThan(0);
    expect(row.sources.every((s) => s.memoryId && s.ref)).toBe(true);
    const note = await deps.memory.get(userId, row.memoryId!);
    expect(note).toMatchObject({ type: "research", source: "jarvis-research" });
    expect(note!.content).toContain("[M1]");

    // A brief quotes many memories at once; that is not a new connection the user made.
    const drafts = await new InsightEngine(h.db).detect(userId);
    expect(drafts.filter((d) => d.memoryIds.includes(note!.id) && d.kind === "new_connection")).toEqual([]);
  });

  it("says so when memory has nothing on the question", async () => {
    const [u] = await h.db.insert(schema.users).values({ email: "empty@example.com" }).returning();
    const row = await runResearch(deps, u.id, "What is my view on uranium?");
    expect(row.status).toBe("done");
    expect(row.memoryId).toBeNull();
    expect(row.summary).toMatch(/Nothing in your memory/);
  });
});

describe("theses", () => {
  it("creates, updates and collects evidence, remembering each change", async () => {
    const t = await createThesis(deps, userId, {
      title: "Power is the AI bottleneck",
      statement: "Data centers are limited by power, not chips.",
      stance: "bullish",
      conviction: 3,
      symbols: ["nvda", "$VST"],
    });
    const detail = await thesisDetail(h.db, userId, t.id);
    expect(detail!.assets.map((a) => a.symbol).sort()).toEqual(["NVDA", "VST"]);
    expect(detail!.origin?.type).toBe("thesis");

    const [idea] = (await deps.memory.search(userId, { q: "power and cooling", mode: "exact" })).map((x) => x.memory);
    await linkEvidence(deps, userId, t.id, idea.id, "supports");
    await expect(linkEvidence(deps, userId, t.id, detail!.origin!.memoryId, "supports")).rejects.toThrow(/itself/);

    await updateThesis(deps, userId, t.id, { conviction: 2, note: "Grid deals are moving faster than expected." });
    const after = await thesisDetail(h.db, userId, t.id);
    expect(after!.conviction).toBe(2);
    expect(after!.supporting.map((e) => e.title)).toEqual([idea.title]);
    expect(after!.updates[0].content).toContain("conviction 3 → 2");
    expect(after!.updates[0].content).toContain("Grid deals");

    await unlinkEvidence(deps, userId, t.id, idea.id);
    expect((await thesisDetail(h.db, userId, t.id))!.supporting).toHaveLength(0);

    const [other] = await h.db.insert(schema.users).values({ email: "other@example.com" }).returning();
    await expect(updateThesis(deps, other.id, t.id, { conviction: 5 })).rejects.toThrow(/not found/);
    expect((await thesesView(h.db, other.id)).length).toBe(0);
  });
});

describe("views", () => {
  it("enriches the watchlist with mentions, holdings and theses", async () => {
    const [core] = await watchlistView(h.db, userId);
    const amd = core.items.find((i) => i.symbol === "AMD")!;
    expect(amd.held).toBe(true);
    expect(amd.mentions).toBeGreaterThan(2);
    expect(amd.theses.map((t) => t.title)).toContain("AMD takes share in inference");
  });

  it("groups the timeline by day and filters by group", async () => {
    const all = await activityView(h.db, userId);
    expect(all.length).toBeGreaterThan(5);
    const insights = await activityView(h.db, userId, { group: "insight" });
    expect(insights.flatMap((d) => d.items).every((a) => a.kind === "insight")).toBe(true);
    const rows = await h.db.select().from(schema.activities).where(and(eq(schema.activities.userId, userId), eq(schema.activities.kind, "insight")));
    expect(insights.flatMap((d) => d.items)).toHaveLength(rows.length);
  });
});
