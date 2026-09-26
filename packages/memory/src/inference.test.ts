import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDatabase, schema, type DatabaseHandle } from "@jarvis/db";
import { HashEmbeddingProvider, MockProvider } from "@jarvis/ai";
import { describePath, GraphInference, nodeLabel } from "@jarvis/knowledge";
import { MemoryService } from "./service";
import { seedDemo } from "./demo";

let h: DatabaseHandle;
let userId: string;
let inference: GraphInference;

beforeAll(async () => {
  h = await createDatabase({ dataDir: "memory://" });
  await h.migrate();
  const svc = new MemoryService({ db: h.db, ai: new MockProvider(), embedder: new HashEmbeddingProvider(), llmExtraction: false });
  ({ userId } = await seedDemo(h.db, svc));
  inference = new GraphInference(h.db);
});
afterAll(async () => h?.close());

describe("graph inference", () => {
  it("finds look-alike pairs from shared neighbours and shared memories", async () => {
    const idx = await inference.index(userId);
    const pairs = inference.similarities(idx).map((s) => `${nodeLabel(s.a)}~${nodeLabel(s.b)}`);
    expect(pairs).toContain("Advanced Micro Devices~NVIDIA");
    expect(pairs).toContain("BTC~ETH");
    const chips = inference.similarities(idx).find((s) => s.b.name === "NVIDIA" && s.a.name === "Advanced Micro Devices")!;
    expect(chips.linked).toBe(false);
    expect(chips.shared.map((n) => n.name)).toEqual(expect.arrayContaining(["AI infrastructure", "Semiconductors"]));
    expect(chips.reason).toMatch(/^Both connect to/);
  });

  it("stores only unlinked pairs as inferred edges and never touches stated ones", async () => {
    const before = await h.db.select().from(schema.relationships).where(and(eq(schema.relationships.userId, userId), eq(schema.relationships.inferred, false)));
    const run = await inference.refresh(userId);
    const again = await inference.refresh(userId);
    expect(again.edges).toBe(run.edges);
    const inferred = await h.db.select().from(schema.relationships).where(and(eq(schema.relationships.userId, userId), eq(schema.relationships.inferred, true)));
    expect(inferred.length).toBe(run.edges);
    expect(inferred.every((e) => e.type === "similar_to" && e.reason)).toBe(true);
    const after = await h.db.select().from(schema.relationships).where(and(eq(schema.relationships.userId, userId), eq(schema.relationships.inferred, false)));
    expect(after.length).toBe(before.length);
  });

  it("traces how a company or scenario reaches the holdings", async () => {
    const idx = await inference.index(userId);
    const openai = [...idx.nodes.values()].find((n) => n.name === "OpenAI")!;
    const paths = inference.impactPaths(idx, openai.id);
    expect(paths.map((p) => nodeLabel(p.target)).sort()).toEqual(["AMD", "NVDA"]);
    const nvda = paths.find((p) => p.target.symbol === "NVDA")!;
    expect(describePath(openai, nvda.steps)).toBe("OpenAI depends on NVIDIA, which issues NVDA");

    const reach = inference.reach(idx);
    const exportRules = reach.find((r) => r.source.name === "Scenario: tighter chip export rules")!;
    expect(exportRules.direct).toBe(false);
    expect(exportRules.share).toBeCloseTo((3000 + 2400) / 6260, 6);
    // Crypto holdings sit in a separate part of the graph.
    expect(exportRules.paths.some((p) => p.target.symbol === "ETH")).toBe(false);
  });
});
