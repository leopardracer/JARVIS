import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, schema, type DatabaseHandle } from "@jarvis/db";
import { HashEmbeddingProvider, MockProvider } from "@jarvis/ai";
import { MemoryService } from "./service";

let h: DatabaseHandle;
let svc: MemoryService;
let userId: string;

beforeAll(async () => {
  h = await createDatabase({ dataDir: "memory://" });
  await h.migrate();
  svc = new MemoryService({ db: h.db, ai: new MockProvider(), embedder: new HashEmbeddingProvider() });
  const [u] = await h.db.insert(schema.users).values({ email: "t@example.com" }).returning();
  userId = u.id;
  const themes = ["AI infrastructure", "Semiconductors"];
  for (const name of themes) await svc.knowledge.upsertEntity(userId, { type: "theme", name });
  await svc.knowledge.upsertEntity(userId, { type: "company", name: "NVIDIA", symbol: "NVDA", aliases: ["Nvidia"] });
});

afterAll(async () => h?.close());

describe("MemoryService", () => {
  it("captures a memory and links known and cashtag entities", async () => {
    const m = await svc.create(userId, {
      type: "thesis",
      title: "GPU demand outlasts the cycle",
      content: "NVIDIA keeps pricing power in AI infrastructure. Watching $AMD as the challenger.",
      tags: ["#AI"],
    });
    expect(m.tags).toEqual(["ai"]);
    const names = m.entities.map((e) => e.symbol ?? e.name).sort();
    expect(names).toEqual(expect.arrayContaining(["AI infrastructure", "AMD", "NVDA"]));
  });

  it("finds memories with exact, semantic and hybrid search", async () => {
    await svc.create(userId, {
      type: "research",
      title: "Data center capex",
      content: "Hyperscalers raised data center spending again; accelerators take the largest share.",
    });
    await svc.create(userId, { type: "note", title: "Groceries", content: "Buy coffee and oat milk." });

    const exact = await svc.search(userId, { q: "hyperscalers", mode: "exact" });
    expect(exact[0]?.memory.title).toBe("Data center capex");

    const semantic = await svc.search(userId, { q: "data center spending", mode: "semantic" });
    expect(semantic[0]?.memory.title).toBe("Data center capex");

    const hybrid = await svc.search(userId, { q: "NVDA", mode: "hybrid" });
    expect(hybrid[0]?.memory.title).toBe("GPU demand outlasts the cycle");
    expect(hybrid[0]?.matchedBy).toContain("entity");
    expect(hybrid.some((h) => h.memory.title === "Groceries")).toBe(false);
  });

  it("pages through memories chronologically with a cursor", async () => {
    const first = await svc.list(userId, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = await svc.list(userId, { limit: 2, cursor: first.nextCursor! });
    const ids = new Set([...first.items, ...second.items].map((m) => m.id));
    expect(ids.size).toBe(3);
    expect(second.nextCursor).toBeNull();
  });

  it("filters by type and entity", async () => {
    const theses = await svc.list(userId, { types: ["thesis"] });
    expect(theses.items.map((m) => m.title)).toEqual(["GPU demand outlasts the cycle"]);
    const nvda = (await svc.knowledge.listEntities(userId)).find((e) => e.symbol === "NVDA")!;
    const byEntity = await svc.list(userId, { entityIds: [nvda.id] });
    expect(byEntity.items).toHaveLength(1);
  });

  it("returns related memories", async () => {
    const m = await svc.create(userId, {
      type: "idea",
      title: "Second-order AI plays",
      content: "Power and cooling suppliers for data center buildouts benefit from accelerator demand.",
    });
    const related = await svc.related(userId, m.id);
    expect(related.map((r) => r.memory.title)).toContain("Data center capex");
    expect(related.some((r) => r.memory.id === m.id)).toBe(false);
  });

  it("updates and deletes", async () => {
    const m = await svc.create(userId, { title: "Temp", content: "Mentions $BTC." });
    const updated = await svc.update(userId, m.id, { content: "Mentions $ETH now." });
    expect(updated?.entities.map((e) => e.symbol)).toContain("ETH");
    expect(await svc.remove(userId, m.id)).toBe(true);
    expect(await svc.get(userId, m.id)).toBeNull();
  });

  it("isolates users", async () => {
    const [other] = await h.db.insert(schema.users).values({ email: "o@example.com" }).returning();
    const res = await svc.search(other.id, { q: "NVIDIA", mode: "hybrid" });
    expect(res).toHaveLength(0);
  });
});

describe("KnowledgeService graph", () => {
  it("builds clusters anchored on themes", async () => {
    const g = await svc.knowledge.graph(userId);
    const nvda = g.nodes.find((n) => n.symbol === "NVDA")!;
    const theme = g.nodes.find((n) => n.label === "AI infrastructure")!;
    expect(nvda.cluster).toBe(theme.id);
    expect(g.clusters.find((c) => c.id === theme.id)!.size).toBeGreaterThan(1);
    expect(g.edges.length).toBeGreaterThan(0);
  });

  it("searches, focuses and describes entities", async () => {
    const g = await svc.knowledge.graph(userId, { q: "nvda" });
    expect(g.nodes.some((n) => n.symbol === "NVDA")).toBe(true);
    const nvda = g.nodes.find((n) => n.symbol === "NVDA")!;
    const hood = await svc.knowledge.neighborhood(userId, nvda.id, 1);
    expect(hood.nodes.length).toBeGreaterThan(1);
    const details = await svc.knowledge.entityDetails(userId, nvda.id);
    expect(details?.memories[0]?.title).toBe("GPU demand outlasts the cycle");
    expect(details?.neighbors.length).toBeGreaterThan(0);
  });

  it("filters by time for timeline mode", async () => {
    const g = await svc.knowledge.graph(userId, { until: new Date(0) });
    expect(g.nodes).toHaveLength(0);
  });
});
