import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDatabase, schema, type DatabaseHandle } from "@jarvis/db";
import { HashEmbeddingProvider, MockProvider } from "@jarvis/ai";
import { MemoryService } from "./service";
import { seedDemo } from "./demo";

let h: DatabaseHandle;
let svc: MemoryService;

beforeAll(async () => {
  h = await createDatabase({ dataDir: "memory://" });
  await h.migrate();
  svc = new MemoryService({ db: h.db, ai: new MockProvider(), embedder: new HashEmbeddingProvider() });
});
afterAll(async () => h?.close());

describe("demo seed", () => {
  it("builds a connected, demo-only workspace and is idempotent", async () => {
    const first = await seedDemo(h.db, svc);
    expect(first.created).toBe(true);
    const again = await seedDemo(h.db, svc);
    expect(again).toEqual({ userId: first.userId, created: false });

    const stats = await svc.stats(first.userId);
    expect(stats.memories).toBe(18);
    expect(stats.relationships).toBeGreaterThan(30);

    const tx = await h.db.select().from(schema.transactions).where(eq(schema.transactions.userId, first.userId));
    expect(tx.every((t) => t.dataMode === "demo")).toBe(true);

    const graph = await svc.knowledge.graph(first.userId);
    const themes = graph.clusters.map((c) => c.label).sort();
    expect(themes).toEqual(["AI infrastructure", "Crypto", "Data centers", "Semiconductors"]);
    const eth = graph.nodes.find((n) => n.symbol === "ETH")!;
    expect(graph.clusters.find((c) => c.id === eth.cluster)?.label).toBe("Crypto");

    const hits = await svc.search(first.userId, { q: "what could hurt my chip positions?", mode: "hybrid" });
    expect(hits.length).toBeGreaterThan(0);

    const old = await svc.knowledge.graph(first.userId, { until: new Date(Date.now() - 100 * 86_400_000) });
    expect(old.nodes.length).toBeLessThan(graph.nodes.length);

    // Trades come from the mock brokerage and stay linked to the memories that explain them.
    expect(tx).toHaveLength(5);
    expect(tx.every((t) => t.externalId?.startsWith("demo-fill-") && t.memoryId)).toBe(true);

    // Insights are computed by the engine, not hardcoded.
    const insights = await h.db.select().from(schema.insights).where(eq(schema.insights.userId, first.userId));
    const kinds = insights.map((i) => i.kind).sort();
    expect(kinds).toEqual(["concentration", "exposure_change", "goal", "goal", "new_connection", "thesis_change", "thesis_change"]);
    expect(insights.every((i) => i.evidence.length > 0 && i.fingerprint)).toBe(true);
    expect(insights.filter((i) => i.kind === "goal").map((i) => i.title).sort()).toEqual(["Crypto is back inside your 15% cap", "NVDA is above your 40% cap"]);
  });
});
