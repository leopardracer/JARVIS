import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDatabase, schema, type DatabaseHandle } from "@jarvis/db";
import { HashEmbeddingProvider, MockProvider } from "@jarvis/ai";
import { InsightEngine, parseLimit } from "@jarvis/knowledge";
import { MemoryService } from "./service";

const DAY = 86_400_000;
const NOW = new Date("2026-06-30T12:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);

let h: DatabaseHandle;
let svc: MemoryService;
let engine: InsightEngine;

beforeAll(async () => {
  h = await createDatabase({ dataDir: "memory://" });
  await h.migrate();
  svc = new MemoryService({ db: h.db, ai: new MockProvider(), embedder: new HashEmbeddingProvider(), llmExtraction: false });
  engine = new InsightEngine(h.db);
});
afterAll(async () => h?.close());

async function user(email: string) {
  const [u] = await h.db.insert(schema.users).values({ email }).returning();
  return u.id;
}

/** A portfolio with one trade per row, all demo. */
async function trades(userId: string, rows: { asset: string; side: "buy" | "sell"; qty: string; price: string; days: number; memoryId?: string }[]) {
  const [p] = await h.db.insert(schema.portfolios).values({ userId, name: "Test", dataMode: "demo" }).returning();
  for (const r of rows) {
    await h.db.insert(schema.transactions).values({ userId, portfolioId: p.id, assetEntityId: r.asset, side: r.side, quantity: r.qty, price: r.price, executedAt: ago(r.days), dataMode: "demo", memoryId: r.memoryId });
  }
}

describe("parseLimit", () => {
  it("reads caps written in plain language", () => {
    expect(parseLimit("Keep crypto under 15% of the portfolio")).toBe(0.15);
    expect(parseLimit("no more than 7.5 % in one stock")).toBe(0.075);
    expect(parseLimit("Crypto capped at 10%")).toBe(0.1);
    expect(parseLimit("I like 15% returns")).toBeNull();
  });
});

describe("InsightEngine", () => {
  it("flags a goal breach, a trade against a thesis and opposing theses, once", async () => {
    const userId = await user("engine-1@example.com");
    const k = svc.knowledge;
    const sol = await k.upsertEntity(userId, { type: "asset", name: "Solana", symbol: "SOL" });
    const spy = await k.upsertEntity(userId, { type: "asset", name: "SPY", symbol: "SPY" });
    await svc.create(userId, { type: "goal", title: "Max 20% in $SOL", content: "Solana stays at most a fifth of the portfolio.", occurredAt: ago(90) });
    const sell = await svc.create(userId, { type: "trade", title: "Sold some SOL", content: "Took profit on $SOL.", occurredAt: ago(3) });
    await trades(userId, [
      { asset: spy.id, side: "buy", qty: "10", price: "100", days: 80 },
      { asset: sol.id, side: "buy", qty: "10", price: "50", days: 60 },
      { asset: sol.id, side: "sell", qty: "2", price: "80", days: 3, memoryId: sell.id },
    ]);
    const origin = await svc.create(userId, { type: "thesis", title: "Solana wins consumer crypto", content: "$SOL", occurredAt: ago(70) });
    const [bull] = await h.db.insert(schema.theses).values({ userId, title: "Solana wins consumer crypto", statement: "…", stance: "bullish", conviction: 4 }).returning();
    await h.db.insert(schema.thesisMemories).values({ thesisId: bull.id, memoryId: origin.id, relation: "origin" });
    const [bear] = await h.db.insert(schema.theses).values({ userId, title: "Alt L1s lose share", statement: "…", stance: "bearish" }).returning();
    await h.db.insert(schema.thesisAssets).values([{ thesisId: bull.id, assetEntityId: sol.id }, { thesisId: bear.id, assetEntityId: sol.id }]);

    const first = await engine.run(userId, NOW);
    const byKind = (kind: string) => first.drafts.filter((d) => d.kind === kind);

    // SOL: 8 × 50 = 400 of 1,400 cost basis = 28.6%, above the 20% cap.
    expect(byKind("goal")).toHaveLength(1);
    expect(byKind("goal")[0].title).toBe("SOL is above your 20% cap");
    expect(byKind("goal")[0].whatChanged).toContain("28.6%");

    const contradictions = byKind("contradiction").map((d) => d.title);
    expect(contradictions).toContain("You sold SOL against your bullish thesis");
    expect(contradictions).toContain("Two active theses disagree on SOL");
    expect(first.created.length).toBe(first.drafts.length);

    const again = await engine.run(userId, NOW);
    expect(again.created).toHaveLength(0);
    const stored = await h.db.select().from(schema.insights).where(eq(schema.insights.userId, userId));
    expect(stored).toHaveLength(first.drafts.length);
    const activity = await svc.recentActivity(userId, 50);
    expect(activity.filter((a) => a.kind === "insight")).toHaveLength(first.drafts.length);
  });

  it("notices a topic that keeps coming up and a first-time connection", async () => {
    const userId = await user("engine-2@example.com");
    const k = svc.knowledge;
    await k.upsertEntity(userId, { type: "company", name: "TSMC" });
    await k.upsertEntity(userId, { type: "theme", name: "Robotics" });
    await svc.create(userId, { type: "note", title: "Fab visit notes", content: "TSMC capacity is sold out.", occurredAt: ago(50) });
    for (const d of [10, 6, 2]) {
      await svc.create(userId, { type: "note", title: `TSMC note ${d}`, content: "More on TSMC pricing.", occurredAt: ago(d) });
    }
    await svc.create(userId, { type: "idea", title: "Robots need chips", content: "Robotics demand could fill TSMC fabs.", occurredAt: ago(1) });

    const drafts = await engine.detect(userId, NOW);
    const freq = drafts.find((d) => d.kind === "mention_frequency");
    expect(freq?.title).toBe("TSMC keeps coming up");
    expect(freq?.whatChanged).toMatch(/^4 memories mention TSMC in the last 14 days/);
    const link = drafts.find((d) => d.kind === "new_connection");
    expect(link?.title).toMatch(/TSMC|Robotics/);
    expect(link?.evidence[0].label).toBe("Robots need chips");
  });

  it("stays quiet on an empty workspace", async () => {
    const userId = await user("engine-3@example.com");
    expect(await engine.detect(userId, NOW)).toEqual([]);
  });
});
