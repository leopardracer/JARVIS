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
    expect(stats.memories).toBe(16);
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
  });
});
