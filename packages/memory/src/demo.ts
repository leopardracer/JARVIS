import { eq, sql } from "drizzle-orm";
import { schema, type Database } from "@jarvis/db";
import type { CreateMemoryInput, EntityType, RelationshipType } from "@jarvis/types";
import type { MemoryService } from "./service";

/**
 * Demo workspace. Everything here is fictional and illustrative: prices are
 * round placeholder numbers, not market data, and every financial row is
 * stored with data_mode = "demo" so it can never be mistaken for live data.
 */
export const DEMO_EMAIL = "demo@jarvis.local";

const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(Date.now() - d * DAY);

type SeedEntity = { key: string; type: EntityType; name: string; symbol?: string; aliases?: string[]; description: string };

const ENTITIES: SeedEntity[] = [
  { key: "ai", type: "theme", name: "AI infrastructure", aliases: ["AI infra", "AI compute"], description: "Compute, networking and software that train and serve AI models." },
  { key: "semis", type: "theme", name: "Semiconductors", aliases: ["chips", "chipmakers"], description: "Chip design and manufacturing." },
  { key: "dc", type: "theme", name: "Data centers", aliases: ["data center", "hyperscalers", "hyperscaler"], description: "Facilities, power and cooling behind cloud and AI workloads." },
  { key: "crypto", type: "theme", name: "Crypto", aliases: ["digital assets"], description: "Blockchain networks and their native assets." },
  { key: "nvidia", type: "company", name: "NVIDIA", aliases: ["Nvidia"], description: "Designs GPUs and accelerated computing platforms." },
  { key: "amdCo", type: "company", name: "Advanced Micro Devices", aliases: ["AMD"], description: "Designs CPUs, GPUs and accelerators." },
  { key: "msft", type: "company", name: "Microsoft", aliases: ["Azure"], description: "Software and cloud platform company." },
  { key: "openai", type: "company", name: "OpenAI", description: "AI research and deployment company." },
  { key: "NVDA", type: "asset", name: "NVDA", symbol: "NVDA", description: "NVIDIA common stock." },
  { key: "AMD", type: "asset", name: "AMD", symbol: "AMD", description: "Advanced Micro Devices common stock." },
  { key: "ETH", type: "asset", name: "Ether", symbol: "ETH", aliases: ["Ethereum"], description: "Native asset of Ethereum." },
  { key: "BTC", type: "asset", name: "Bitcoin", symbol: "BTC", description: "Native asset of the Bitcoin network." },
];

const LINKS: [string, string, RelationshipType][] = [
  ["NVDA", "nvidia", "derived_from"],
  ["AMD", "amdCo", "derived_from"],
  ["nvidia", "ai", "related_to"],
  ["nvidia", "semis", "related_to"],
  ["amdCo", "semis", "related_to"],
  ["amdCo", "ai", "related_to"],
  ["msft", "dc", "related_to"],
  ["openai", "ai", "related_to"],
  ["openai", "msft", "depends_on"],
  ["openai", "nvidia", "depends_on"],
  ["dc", "ai", "related_to"],
  ["ETH", "crypto", "related_to"],
  ["BTC", "crypto", "related_to"],
];

type SeedMemory = CreateMemoryInput & { key: string; days: number };

const MEMORIES: SeedMemory[] = [
  {
    key: "t-ai", days: 118, type: "thesis", title: "AI infrastructure spend is still early",
    content: "Thesis: hyperscalers keep expanding data centers for training and inference for several more years. NVIDIA is the main beneficiary through $NVDA, with Microsoft as the largest buyer of capacity. What would change my mind: two quarters of flat capex guidance.",
    tags: ["ai", "long-term"],
  },
  {
    key: "r-capex", days: 112, type: "research", title: "Notes on hyperscaler capex",
    content: "Read through the latest Microsoft commentary. Spending on data centers is described as capacity-constrained, not demand-constrained. Power availability is becoming the bottleneck. Supports the AI infrastructure thesis.",
    tags: ["capex"], source: "reading",
  },
  {
    key: "tr-nvda", days: 110, type: "trade", title: "Bought NVDA",
    content: "Opened a starter position in $NVDA after the capex notes. Sized small because the valuation already prices in a lot of growth.",
    tags: ["position"],
  },
  {
    key: "t-amd", days: 96, type: "thesis", title: "AMD takes share in inference",
    content: "Thesis: as workloads shift from training to inference, buyers care more about cost per token. Advanced Micro Devices can win share there, which is good for $AMD. Risk: software ecosystem still trails NVIDIA.",
    tags: ["ai", "semiconductors"],
  },
  {
    key: "tr-amd", days: 92, type: "trade", title: "Bought AMD",
    content: "Bought $AMD to express the inference-share thesis. Keeps the semiconductors exposure from depending on a single company.",
    tags: ["position"],
  },
  {
    key: "r-inference", days: 80, type: "research", title: "Inference economics",
    content: "OpenAI and other labs report that serving costs now exceed training costs for popular models. Suppliers that lower cost per token (NVIDIA, AMD) gain pricing power in different ways. OpenAI depends on Microsoft for most of its capacity.",
    tags: ["inference"], source: "reading",
  },
  {
    key: "t-eth", days: 74, type: "thesis", title: "Ether as a settlement layer",
    content: "Thesis: more on-chain activity settles on Ethereum and its rollups, which supports demand for $ETH over a multi-year horizon. Keep crypto as a small, capped part of the portfolio.",
    tags: ["crypto"],
  },
  {
    key: "tr-eth", days: 70, type: "trade", title: "Bought ETH",
    content: "Added $ETH in line with the settlement-layer thesis.",
    tags: ["position"],
  },
  {
    key: "g-crypto", days: 69, type: "goal", title: "Keep crypto under 15% of the portfolio",
    content: "Rule for myself: Bitcoin plus Ether stay below 15% of total cost basis. Rebalance instead of adding when crypto runs ahead.",
    tags: ["risk", "crypto"],
  },
  {
    key: "tr-btc", days: 60, type: "trade", title: "Bought BTC",
    content: "Small $BTC position as a hedge alongside ETH.",
    tags: ["position"],
  },
  {
    key: "e-export", days: 45, type: "market_event", title: "Scenario: tighter chip export rules",
    content: "Demo scenario: new export restrictions on advanced chips are proposed. Would hit NVIDIA and Advanced Micro Devices revenue from affected regions. Worth checking how much of both theses depends on those sales.",
    tags: ["risk", "semiconductors"],
  },
  {
    key: "n-concentration", days: 38, type: "note", title: "Too much AI in one basket?",
    content: "NVDA and AMD together are most of the equity side, and both depend on the same AI infrastructure cycle. If capex slows, they fall together. Consider whether the Microsoft exposure through data centers is enough diversification.",
    tags: ["risk"],
  },
  {
    key: "i-power", days: 30, type: "idea", title: "Second-order play: power and cooling",
    content: "If power is the bottleneck for data centers, companies that supply power and cooling may benefit from AI infrastructure spend with less valuation risk. Research candidates.",
    tags: ["idea"],
  },
  {
    key: "e-etf", days: 21, type: "market_event", title: "Scenario: strong inflows into crypto funds",
    content: "Demo scenario: a week of strong inflows into Bitcoin funds. Crypto prices up sharply, which pushes crypto toward the 15% cap.",
    tags: ["crypto"],
  },
  {
    key: "r-amd-software", days: 12, type: "research", title: "AMD software gap check",
    content: "Developer feedback suggests AMD's software stack improved but still needs more manual tuning than NVIDIA's. Mixed evidence for the inference-share thesis; the thesis needs a longer timeline.",
    tags: ["semiconductors"], source: "reading",
  },
  {
    key: "tr-btc-trim", days: 6, type: "trade", title: "Trimmed BTC",
    content: "Sold part of the $BTC position to stay under the crypto cap after the fund inflows.",
    tags: ["position", "rebalance"],
  },
];

// Illustrative fills. Not real prices.
const TRADES: { memory: string; asset: string; side: "buy" | "sell"; quantity: string; price: string }[] = [
  { memory: "tr-nvda", asset: "NVDA", side: "buy", quantity: "20", price: "100" },
  { memory: "tr-amd", asset: "AMD", side: "buy", quantity: "15", price: "120" },
  { memory: "tr-eth", asset: "ETH", side: "buy", quantity: "0.5", price: "2500" },
  { memory: "tr-btc", asset: "BTC", side: "buy", quantity: "0.01", price: "60000" },
  { memory: "tr-btc-trim", asset: "BTC", side: "sell", quantity: "0.004", price: "70000" },
];

export type SeedResult = { userId: string; created: boolean };

export async function seedDemo(db: Database, memory: MemoryService, opts: { email?: string } = {}): Promise<SeedResult> {
  const email = opts.email ?? DEMO_EMAIL;
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing) return { userId: existing.id, created: false };

  const [user] = await db
    .insert(schema.users)
    .values({ email, displayName: "Demo", mode: "demo" })
    .returning();
  const userId = user.id;
  const k = memory.knowledge;

  const ent = new Map<string, string>();
  for (const e of ENTITIES) {
    const row = await k.upsertEntity(userId, { ...e, metadata: { demo: true } });
    ent.set(e.key, row.id);
  }
  for (const [s, t, type] of LINKS) await k.link(userId, ent.get(s)!, ent.get(t)!, type);

  const mem = new Map<string, string>();
  for (const { key, days, ...input } of MEMORIES) {
    const m = await memory.create(userId, { source: "demo", ...input, occurredAt: daysAgo(days) });
    mem.set(key, m.id);
  }

  // Financial context.
  const portfolioEntity = await k.upsertEntity(userId, {
    type: "portfolio",
    name: "Demo portfolio",
    description: "Fictional holdings with illustrative prices.",
    metadata: { demo: true },
  });
  const [portfolio] = await db
    .insert(schema.portfolios)
    .values({ userId, name: "Demo portfolio (illustrative)", provider: "mock", dataMode: "demo", entityId: portfolioEntity.id })
    .returning();
  const holdings = new Map<string, { qty: number; cost: number }>();
  for (const t of TRADES) {
    const days = MEMORIES.find((m) => m.key === t.memory)!.days;
    await db.insert(schema.transactions).values({
      userId,
      portfolioId: portfolio.id,
      assetEntityId: ent.get(t.asset)!,
      side: t.side,
      quantity: t.quantity,
      price: t.price,
      executedAt: daysAgo(days),
      dataMode: "demo",
      memoryId: mem.get(t.memory)!,
    });
    const h = holdings.get(t.asset) ?? { qty: 0, cost: 0 };
    const q = Number(t.quantity);
    const p = Number(t.price);
    if (t.side === "buy") holdings.set(t.asset, { qty: h.qty + q, cost: h.cost + q * p });
    else holdings.set(t.asset, { qty: h.qty - q, cost: h.cost - (h.cost / h.qty) * q });
  }
  for (const [asset, h] of holdings) {
    await k.link(userId, portfolioEntity.id, ent.get(asset)!, "invested_in");
    await db.insert(schema.positions).values({
      portfolioId: portfolio.id,
      assetEntityId: ent.get(asset)!,
      quantity: h.qty.toString(),
      averageCost: (h.cost / h.qty).toFixed(2),
    });
  }

  const thesisRows: { key: string; stance: string; conviction: number; assets: string[]; evidence: [string, string][] }[] = [
    { key: "t-ai", stance: "bullish", conviction: 4, assets: ["NVDA"], evidence: [["r-capex", "supports"], ["n-concentration", "contradicts"], ["e-export", "contradicts"]] },
    { key: "t-amd", stance: "bullish", conviction: 3, assets: ["AMD"], evidence: [["r-inference", "supports"], ["r-amd-software", "contradicts"], ["e-export", "contradicts"]] },
    { key: "t-eth", stance: "bullish", conviction: 2, assets: ["ETH"], evidence: [["g-crypto", "supports"]] },
  ];
  for (const t of thesisRows) {
    const m = MEMORIES.find((x) => x.key === t.key)!;
    const [row] = await db
      .insert(schema.theses)
      .values({ userId, title: m.title, statement: m.content, stance: t.stance, conviction: t.conviction, createdAt: daysAgo(m.days) })
      .returning();
    await db.insert(schema.thesisMemories).values([
      { thesisId: row.id, memoryId: mem.get(t.key)!, relation: "origin" },
      ...t.evidence.map(([key, relation]) => ({ thesisId: row.id, memoryId: mem.get(key)!, relation })),
    ]);
    await db.insert(schema.thesisAssets).values(t.assets.map((a) => ({ thesisId: row.id, assetEntityId: ent.get(a)! })));
  }
  // Evidence against a thesis is also a graph fact.
  const contradicts: [string, string][] = [["r-amd-software", "t-amd"], ["n-concentration", "t-ai"]];
  const nodes = await k.listEntities(userId);
  const nodeFor = (memKey: string) => nodes.find((n) => n.metadata.memoryId === mem.get(memKey))?.id;
  for (const [a, b] of contradicts) {
    const s = nodeFor(a) ?? ent.get("nvidia")!;
    const t = nodeFor(b);
    if (t) await k.link(userId, s, t, "contradicts", mem.get(a));
  }

  const [watchlist] = await db.insert(schema.watchlists).values({ userId, name: "Core" }).returning();
  await db.insert(schema.watchlistItems).values([
    { watchlistId: watchlist.id, assetEntityId: ent.get("NVDA")!, note: "Watch capex guidance" },
    { watchlistId: watchlist.id, assetEntityId: ent.get("AMD")!, note: "Watch software adoption" },
    { watchlistId: watchlist.id, assetEntityId: ent.get("ETH")!, note: "Keep under crypto cap" },
    { watchlistId: watchlist.id, assetEntityId: ent.get("BTC")!, note: "Hedge, capped" },
  ]);

  await db.insert(schema.research).values([
    { userId, query: "How constrained is hyperscaler capex?", summary: MEMORIES.find((m) => m.key === "r-capex")!.content, status: "done", memoryId: mem.get("r-capex")!, createdAt: daysAgo(112) },
    { userId, query: "Is AMD's software good enough for inference?", summary: MEMORIES.find((m) => m.key === "r-amd-software")!.content, status: "done", memoryId: mem.get("r-amd-software")!, createdAt: daysAgo(12) },
  ]);

  // Insights derived from the seeded data above.
  const total = [...holdings.values()].reduce((s, h) => s + h.cost, 0);
  const crypto = (holdings.get("ETH")?.cost ?? 0) + (holdings.get("BTC")?.cost ?? 0);
  const ai = (holdings.get("NVDA")?.cost ?? 0) + (holdings.get("AMD")?.cost ?? 0);
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  await db.insert(schema.insights).values([
    {
      userId, kind: "concentration", title: "Most of your equity risk is one theme",
      whatChanged: `NVDA and AMD are ${pct(ai)} of cost basis, and both link to AI infrastructure in your graph.`,
      whyItMatters: "Your own note says they would fall together if data center capex slows.",
      evidence: [{ label: "Too much AI in one basket?", memoryId: mem.get("n-concentration") }, { label: "AI infrastructure spend is still early", memoryId: mem.get("t-ai") }],
      memoryIds: [mem.get("n-concentration")!, mem.get("t-ai")!],
      entityIds: [ent.get("ai")!, ent.get("NVDA")!, ent.get("AMD")!],
      createdAt: daysAgo(2),
    },
    {
      userId, kind: "thesis_pressure", title: "New evidence against the AMD thesis",
      whatChanged: "Your latest research note found the software gap is narrower but still there.",
      whyItMatters: "Two of the three notes linked to this thesis now argue against it or for a longer timeline.",
      evidence: [{ label: "AMD software gap check", memoryId: mem.get("r-amd-software") }, { label: "Scenario: tighter chip export rules", memoryId: mem.get("e-export") }],
      memoryIds: [mem.get("r-amd-software")!, mem.get("e-export")!, mem.get("t-amd")!],
      entityIds: [ent.get("AMD")!, ent.get("amdCo")!],
      createdAt: daysAgo(1),
    },
    {
      userId, kind: "goal", title: "Crypto is back inside your cap",
      whatChanged: `After trimming BTC, crypto is ${pct(crypto)} of cost basis.`,
      whyItMatters: "Your rule is to keep Bitcoin plus Ether under 15%.",
      evidence: [{ label: "Keep crypto under 15% of the portfolio", memoryId: mem.get("g-crypto") }, { label: "Trimmed BTC", memoryId: mem.get("tr-btc-trim") }],
      memoryIds: [mem.get("g-crypto")!, mem.get("tr-btc-trim")!],
      entityIds: [ent.get("BTC")!, ent.get("ETH")!, ent.get("crypto")!],
      createdAt: daysAgo(5),
    },
  ]);

  await backdate(db, userId);
  return { userId, created: true };
}

/** Move seeded rows to their story dates so the timeline has history. */
async function backdate(db: Database, userId: string) {
  await db.execute(sql`update memories set created_at = occurred_at, updated_at = occurred_at where user_id = ${userId} and occurred_at is not null`);
  await db.execute(sql`
    update activities a set created_at = m.created_at
    from memories m where a.subject_id = m.id and a.user_id = ${userId}`);
  await db.execute(sql`
    update relationships r set created_at = m.created_at
    from memories m where r.memory_id = m.id and r.user_id = ${userId}`);
  await db.execute(sql`
    update entities e set created_at = coalesce(
      (select min(m.created_at) from memory_entities me join memories m on m.id = me.memory_id where me.entity_id = e.id),
      now() - interval '120 days')
    where e.user_id = ${userId}`);
  await db.execute(sql`
    update relationships r set created_at = greatest(
      (select created_at from entities where id = r.source_id),
      (select created_at from entities where id = r.target_id))
    where r.user_id = ${userId} and r.memory_id is null`);
}
