import { and, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { schema, type Database } from "@jarvis/db";
import { exposure, type Exposure } from "./exposure";
import { describePath, GraphInference, nodeLabel, originMemory } from "./inference";

const { memories, memoryEntities, entities, relationships, theses, thesisMemories, thesisAssets, transactions, insights, activities } = schema;

const DAY = 86_400_000;

export const INSIGHT_KINDS = [
  "concentration",
  "exposure_change",
  "goal",
  "thesis_change",
  "contradiction",
  "new_connection",
  "mention_frequency",
  "second_order",
  "similarity",
] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];

export type InsightEvidence = { label: string; memoryId?: string };

export type InsightDraft = {
  kind: InsightKind;
  title: string;
  whatChanged: string;
  whyItMatters: string;
  evidence: InsightEvidence[];
  memoryIds: string[];
  entityIds: string[];
  /** Identifies the situation, so the same finding is never raised twice. */
  fingerprint: string;
};

export type InsightRun = {
  drafts: InsightDraft[];
  created: { id: string; kind: string; title: string }[];
};

type Mem = { id: string; title: string; type: string; content: string; at: Date; source: string; tags: string[] };

/** Notes JARVIS wrote itself (research briefs, thesis change logs) quote many things at once; they are not new signal. */
const userAuthored = (m: Mem) => !m.source.startsWith("jarvis") && !m.tags.includes("thesis-update");

type Snapshot = {
  now: Date;
  nowExposure: Exposure;
  thenExposure: Exposure;
  memories: Map<string, Mem>;
  /** memoryId → entity ids it mentions (not the memory's own node). */
  mentions: Map<string, Set<string>>;
  entities: Map<string, { id: string; type: string; name: string; symbol: string | null }>;
  recentTrades: { id: string; assetId: string; symbol: string | null; side: string; quantity: number; executedAt: Date; memoryId: string | null }[];
};

export const INSIGHT_WINDOW_DAYS = 30;

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const day = (d: Date) => dateFmt.format(d);
const quote = (s: string) => `“${s}”`;
const listOf = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
const assetLabel = (e: { symbol: string | null; name: string }) => e.symbol ?? e.name;

/**
 * Explainable, rule-based insights over memory, graph and portfolio. Every
 * insight says what changed, why it matters and which memories show it; no
 * detector uses market data or a language model, so results are reproducible.
 */
export class InsightEngine {
  constructor(private db: Database) {}

  async detect(userId: string, now = new Date()): Promise<InsightDraft[]> {
    const snap = await this.snapshot(userId, now);
    const thesisDrafts = await this.thesisChanges(userId, snap);
    const covered = new Set(thesisDrafts.flatMap((d) => d.memoryIds));
    return [
      ...this.concentration(snap),
      ...this.exposureChange(snap),
      ...this.goals(snap),
      ...thesisDrafts,
      ...(await this.contradictions(userId, snap, covered)),
      ...(await this.newConnections(userId, snap)),
      ...this.mentionFrequency(snap),
      ...(await this.graphInference(userId, snap)),
    ];
  }

  /**
   * Refresh inferred graph edges, then detect and store new insights.
   * Findings already raised (even if dismissed) are skipped.
   */
  async run(userId: string, now = new Date()): Promise<InsightRun> {
    await new GraphInference(this.db).refresh(userId, now);
    const drafts = await this.detect(userId, now);
    const created: InsightRun["created"] = [];
    for (const d of drafts) {
      const [row] = await this.db
        .insert(insights)
        .values({ userId, ...d, createdAt: now })
        .onConflictDoNothing({ target: [insights.userId, insights.fingerprint] })
        .returning({ id: insights.id, kind: insights.kind, title: insights.title });
      if (!row) continue;
      created.push(row);
      await this.db.insert(activities).values({ userId, kind: "insight", subjectType: "insight", subjectId: row.id, summary: `Insight: ${row.title}`, createdAt: now });
    }
    return { drafts, created };
  }

  private async snapshot(userId: string, now: Date): Promise<Snapshot> {
    const then = new Date(now.getTime() - INSIGHT_WINDOW_DAYS * DAY);
    const [nowExposure, thenExposure] = await Promise.all([exposure(this.db, userId, now), exposure(this.db, userId, then)]);
    const memRows = await this.db
      .select({ id: memories.id, title: memories.title, type: memories.type, content: memories.content, source: memories.source, tags: memories.tags, at: sql<Date>`coalesce(${memories.occurredAt}, ${memories.createdAt})` })
      .from(memories)
      .where(eq(memories.userId, userId));
    const mems = new Map(memRows.map((m) => [m.id, { ...m, at: new Date(m.at) }]));
    const links = await this.db
      .select({ memoryId: memoryEntities.memoryId, entityId: memoryEntities.entityId })
      .from(memoryEntities)
      .innerJoin(memories, eq(memories.id, memoryEntities.memoryId))
      .where(and(eq(memories.userId, userId), sql`${memoryEntities.role} <> 'subject'`));
    const mentions = new Map<string, Set<string>>();
    for (const l of links) {
      if (!mentions.has(l.memoryId)) mentions.set(l.memoryId, new Set());
      mentions.get(l.memoryId)!.add(l.entityId);
    }
    const ents = await this.db
      .select({ id: entities.id, type: entities.type, name: entities.name, symbol: entities.symbol })
      .from(entities)
      .where(eq(entities.userId, userId));
    const recentTrades = await this.db
      .select({ id: transactions.id, assetId: transactions.assetEntityId, symbol: entities.symbol, side: transactions.side, quantity: transactions.quantity, executedAt: transactions.executedAt, memoryId: transactions.memoryId })
      .from(transactions)
      .innerJoin(entities, eq(entities.id, transactions.assetEntityId))
      .where(and(eq(transactions.userId, userId), gt(transactions.executedAt, then), lte(transactions.executedAt, now)))
      .orderBy(desc(transactions.executedAt));
    return {
      now,
      nowExposure,
      thenExposure,
      memories: mems,
      mentions,
      entities: new Map(ents.map((e) => [e.id, e])),
      recentTrades: recentTrades.map((t) => ({ ...t, quantity: Number(t.quantity) })),
    };
  }

  /** Recent memories that mention all of the given entities, newest first. */
  private memoriesMentioning(snap: Snapshot, entityIds: string[], opts: { any?: boolean; limit?: number } = {}): Mem[] {
    return [...snap.memories.values()]
      .filter((m) => {
        const set = snap.mentions.get(m.id);
        if (!set) return false;
        return opts.any ? entityIds.some((id) => set.has(id)) : entityIds.every((id) => set.has(id));
      })
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, opts.limit ?? 3);
  }

  private tradeEvidence(snap: Snapshot, assetIds?: Set<string>): { evidence: InsightEvidence[]; memoryIds: string[]; summary: string[] } {
    const trades = snap.recentTrades.filter((t) => !assetIds || assetIds.has(t.assetId));
    const evidence: InsightEvidence[] = [];
    const memoryIds: string[] = [];
    const summary: string[] = [];
    for (const t of trades) {
      const verb = t.side === "sell" ? "sold" : t.side === "buy" ? "bought" : t.side;
      summary.push(`${verb} ${t.symbol ?? "an asset"} on ${day(t.executedAt)}`);
      const m = t.memoryId ? snap.memories.get(t.memoryId) : undefined;
      if (m) {
        evidence.push({ label: m.title, memoryId: m.id });
        memoryIds.push(m.id);
      }
    }
    return { evidence, memoryIds, summary };
  }

  // ---------- Portfolio ----------

  concentration(snap: Snapshot): InsightDraft[] {
    const top = snap.nowExposure.themes[0];
    if (!top || top.share < 0.5 || top.assets.length < 2) return [];
    const symbols = top.assets.map(assetLabel);
    const others = snap.nowExposure.themes.slice(1).filter((t) => t.share >= 0.5).map((t) => t.theme);
    const notes = this.memoriesMentioning(snap, [top.themeId, ...top.assets.map((a) => a.assetId)], { any: true, limit: 12 })
      .filter((m) => m.type === "note" || m.type === "thesis" || m.type === "goal")
      .slice(0, 3);
    return [
      {
        kind: "concentration",
        title: `${pct(top.share)} of your cost basis rides on ${top.theme}`,
        whatChanged: `${listOf(symbols)} link to ${top.theme} in your graph and make up ${pct(top.share)} of cost basis.${others.length ? ` The same holdings also link to ${listOf(others)}.` : ""}`,
        whyItMatters: `Positions that share a driver tend to move together. If the ${top.theme} cycle turns, most of the portfolio is exposed at once.`,
        evidence: notes.map((m) => ({ label: m.title, memoryId: m.id })),
        memoryIds: notes.map((m) => m.id),
        entityIds: [top.themeId, ...top.assets.map((a) => a.assetId)],
        fingerprint: `concentration:${top.themeId}:${Math.round(top.share * 10)}`,
      },
    ];
  }

  exposureChange(snap: Snapshot): InsightDraft[] {
    if (!snap.recentTrades.length || !snap.thenExposure.totalCost) return [];
    const then = new Map(snap.thenExposure.themes.map((t) => [t.themeId, t]));
    const ids = new Set([...then.keys(), ...snap.nowExposure.themes.map((t) => t.themeId)]);
    const moved = [...ids]
      .map((id) => {
        const n = snap.nowExposure.themes.find((t) => t.themeId === id);
        const p = then.get(id);
        return { id, theme: n?.theme ?? p!.theme, before: p?.share ?? 0, after: n?.share ?? 0 };
      })
      .filter((c) => Math.abs(c.after - c.before) >= 0.03);
    // Themes held through the same assets move identically; report them as one line.
    const groups = new Map<string, { ids: string[]; themes: string[]; before: number; after: number }>();
    for (const c of moved) {
      const k = `${pct(c.before)}:${pct(c.after)}`;
      const g = groups.get(k) ?? { ids: [], themes: [], before: c.before, after: c.after };
      g.ids.push(c.id);
      g.themes.push(c.theme);
      groups.set(k, g);
    }
    const changes = [...groups.values()]
      .map((g) => ({ ...g, themes: g.themes.sort() }))
      .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before) || a.after - b.after)
      .slice(0, 3);
    if (!changes.length) return [];
    const trades = this.tradeEvidence(snap);
    const first = changes[0];
    const name = (g: (typeof changes)[number]) => listOf(g.themes);
    return [
      {
        kind: "exposure_change",
        title: `${name(first)} exposure ${first.after > first.before ? "rose" : "fell"} to ${pct(first.after)}`,
        whatChanged: `Over the last ${INSIGHT_WINDOW_DAYS} days: ${changes.map((g) => `${name(g)} ${pct(g.before)} → ${pct(g.after)}`).join("; ")}.`,
        whyItMatters: `The shift comes from your own trades (${listOf(trades.summary.slice(0, 3))}), measured on cost basis. Check that the new mix is the one you intended.`,
        evidence: trades.evidence,
        memoryIds: trades.memoryIds,
        entityIds: changes.flatMap((g) => g.ids),
        fingerprint: `exposure:${snap.recentTrades[0].id}`,
      },
    ];
  }

  goals(snap: Snapshot): InsightDraft[] {
    const drafts: InsightDraft[] = [];
    for (const m of snap.memories.values()) {
      if (m.type !== "goal") continue;
      const limit = parseLimit(`${m.title} ${m.content}`);
      if (limit === null) continue;
      const mentioned = [...(snap.mentions.get(m.id) ?? [])].map((id) => snap.entities.get(id)).filter((e) => !!e);
      const theme = mentioned.find((e) => e.type === "theme");
      const assetIds = new Set(mentioned.filter((e) => e.type === "asset").map((e) => e.id));
      const measure = (ex: Exposure) => {
        if (!ex.totalCost) return null;
        if (theme) return ex.themes.find((t) => t.themeId === theme.id)?.share ?? 0;
        if (!assetIds.size) return null;
        return ex.holdings.filter((h) => assetIds.has(h.assetId)).reduce((s, h) => s + h.cost, 0) / ex.totalCost;
      };
      const now = measure(snap.nowExposure);
      if (now === null) continue;
      const before = measure(snap.thenExposure);
      const target = theme?.name ?? listOf(mentioned.filter((e) => e.type === "asset").map(assetLabel));
      const targetAssets = theme ? new Set(snap.nowExposure.themes.find((t) => t.themeId === theme.id)?.assets.map((a) => a.assetId) ?? []) : assetIds;
      const trades = this.tradeEvidence(snap, targetAssets);
      const base = {
        kind: "goal" as const,
        evidence: [{ label: m.title, memoryId: m.id }, ...trades.evidence],
        memoryIds: [m.id, ...trades.memoryIds],
        entityIds: theme ? [theme.id] : [...assetIds],
      };
      const cap = `${Math.round(limit * 1000) / 10}%`;
      if (now > limit) {
        drafts.push({
          ...base,
          title: `${target} is above your ${cap} cap`,
          whatChanged: `${target} is ${pct(now)} of cost basis${before !== null ? `, ${before > now ? "down" : "up"} from ${pct(before)} ${INSIGHT_WINDOW_DAYS} days ago` : ""}.`,
          whyItMatters: `Your goal ${quote(m.title)} sets the limit at ${cap}.`,
          fingerprint: `goal:${m.id}:above:${Math.round(now * 100)}`,
        });
      } else if (before !== null && before > limit) {
        drafts.push({
          ...base,
          title: `${target} is back inside your ${cap} cap`,
          whatChanged: `${target} is ${pct(now)} of cost basis, down from ${pct(before)} ${INSIGHT_WINDOW_DAYS} days ago${trades.summary.length ? ` after you ${listOf(trades.summary.slice(0, 2))}` : ""}.`,
          whyItMatters: `Your goal ${quote(m.title)} sets the limit at ${cap}. The rule held.`,
          fingerprint: `goal:${m.id}:back:${snap.recentTrades[0]?.id ?? "none"}`,
        });
      } else if (now >= limit * 0.9) {
        drafts.push({
          ...base,
          title: `${target} is close to your ${cap} cap`,
          whatChanged: `${target} is ${pct(now)} of cost basis.`,
          whyItMatters: `Your goal ${quote(m.title)} sets the limit at ${cap}; another purchase would cross it.`,
          fingerprint: `goal:${m.id}:near`,
        });
      }
    }
    return drafts;
  }

  // ---------- Theses ----------

  private async activeTheses(userId: string) {
    const rows = await this.db.select().from(theses).where(and(eq(theses.userId, userId), eq(theses.status, "active")));
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const ev = await this.db.select().from(thesisMemories).where(inArray(thesisMemories.thesisId, ids));
    const assets = await this.db.select().from(thesisAssets).where(inArray(thesisAssets.thesisId, ids));
    return rows.map((r) => ({
      ...r,
      evidence: ev.filter((e) => e.thesisId === r.id && e.relation !== "origin"),
      origin: ev.find((e) => e.thesisId === r.id && e.relation === "origin")?.memoryId ?? null,
      assetIds: assets.filter((a) => a.thesisId === r.id).map((a) => a.assetEntityId),
    }));
  }

  async thesisChanges(userId: string, snap: Snapshot): Promise<InsightDraft[]> {
    const drafts: InsightDraft[] = [];
    for (const t of await this.activeTheses(userId)) {
      const withMem = t.evidence.map((e) => ({ ...e, memory: snap.memories.get(e.memoryId) })).filter((e) => e.memory);
      const against = withMem.filter((e) => e.relation === "contradicts").sort((a, b) => b.memory!.at.getTime() - a.memory!.at.getTime());
      const support = withMem.filter((e) => e.relation === "supports");
      const latest = against[0];
      if (!latest || against.length < support.length) continue;
      if (snap.now.getTime() - latest.memory!.at.getTime() > 60 * DAY) continue;
      const held = snap.nowExposure.holdings.filter((h) => t.assetIds.includes(h.assetId));
      const heldShare = snap.nowExposure.totalCost ? held.reduce((s, h) => s + h.cost, 0) / snap.nowExposure.totalCost : 0;
      drafts.push({
        kind: "thesis_change",
        title: `The case for ${quote(t.title)} weakened`,
        whatChanged: `${quote(latest.memory!.title)} (${day(latest.memory!.at)}) argues against it. Evidence now stands at ${against.length} against, ${support.length} for.`,
        whyItMatters: `Conviction is still ${t.conviction}/5${held.length ? `, and ${listOf(held.map(assetLabel))} ${held.length === 1 ? "is" : "are"} ${pct(heldShare)} of cost basis` : ""}. Revisit the thesis or record why the evidence does not change it.`,
        evidence: against.slice(0, 3).map((e) => ({ label: e.memory!.title, memoryId: e.memoryId })),
        memoryIds: [...against.slice(0, 3).map((e) => e.memoryId), ...(t.origin ? [t.origin] : [])],
        entityIds: t.assetIds,
        fingerprint: `thesis:${t.id}:${latest.memoryId}`,
      });
    }
    return drafts;
  }

  async contradictions(userId: string, snap: Snapshot, covered: Set<string>): Promise<InsightDraft[]> {
    const drafts: InsightDraft[] = [];
    const since = snap.now.getTime() - INSIGHT_WINDOW_DAYS * DAY;

    // A memory that argues against another node in the graph.
    const edges = await this.db
      .select({ id: relationships.id, sourceId: relationships.sourceId, targetId: relationships.targetId, memoryId: relationships.memoryId })
      .from(relationships)
      .where(and(eq(relationships.userId, userId), eq(relationships.type, "contradicts")));
    for (const e of edges) {
      const m = e.memoryId ? snap.memories.get(e.memoryId) : undefined;
      if (!m || m.at.getTime() < since || covered.has(m.id)) continue;
      const target = snap.entities.get(e.targetId);
      if (!target) continue;
      drafts.push({
        kind: "contradiction",
        title: `${quote(m.title)} contradicts ${quote(target.name)}`,
        whatChanged: `Your ${m.type.replace("_", " ")} from ${day(m.at)} argues against ${quote(target.name)}.`,
        whyItMatters: "Two things you saved cannot both be right. Decide which one holds, and JARVIS will reason from that.",
        evidence: [{ label: m.title, memoryId: m.id }],
        memoryIds: [m.id],
        entityIds: [e.sourceId, e.targetId],
        fingerprint: `contradiction:${e.id}`,
      });
    }

    const active = await this.activeTheses(userId);

    // Trades that go against an active thesis on the same asset.
    for (const tx of snap.recentTrades) {
      for (const t of active) {
        if (!t.assetIds.includes(tx.assetId)) continue;
        const against = (t.stance === "bullish" && tx.side === "sell") || (t.stance === "bearish" && tx.side === "buy");
        if (!against) continue;
        const m = tx.memoryId ? snap.memories.get(tx.memoryId) : undefined;
        drafts.push({
          kind: "contradiction",
          title: `You ${tx.side === "sell" ? "sold" : "bought"} ${tx.symbol} against your ${t.stance} thesis`,
          whatChanged: `On ${day(tx.executedAt)} you ${tx.side === "sell" ? "sold" : "bought"} ${tx.symbol}, while ${quote(t.title)} is active at conviction ${t.conviction}/5.`,
          whyItMatters: "Either the thesis changed and should say so, or the trade was a risk decision worth writing down. Both keep your history honest.",
          evidence: [...(m ? [{ label: m.title, memoryId: m.id }] : []), ...(t.origin ? [{ label: t.title, memoryId: t.origin }] : [])],
          memoryIds: [...(m ? [m.id] : []), ...(t.origin ? [t.origin] : [])],
          entityIds: [tx.assetId],
          fingerprint: `trade-vs-thesis:${tx.id}:${t.id}`,
        });
      }
    }

    // Two active theses that take opposite sides on the same asset.
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i];
        const b = active[j];
        const opposite = (a.stance === "bullish" && b.stance === "bearish") || (a.stance === "bearish" && b.stance === "bullish");
        const shared = a.assetIds.filter((id) => b.assetIds.includes(id));
        if (!opposite || !shared.length) continue;
        const names = shared.map((id) => snap.entities.get(id)).filter((e) => !!e).map(assetLabel);
        drafts.push({
          kind: "contradiction",
          title: `Two active theses disagree on ${listOf(names)}`,
          whatChanged: `${quote(a.title)} is ${a.stance} and ${quote(b.title)} is ${b.stance}.`,
          whyItMatters: "Holding both views can be deliberate, for example over different horizons. If it is not, close one of them.",
          evidence: [a, b].filter((t) => t.origin).map((t) => ({ label: t.title, memoryId: t.origin! })),
          memoryIds: [a, b].flatMap((t) => (t.origin ? [t.origin] : [])),
          entityIds: shared,
          fingerprint: `theses:${[a.id, b.id].sort().join(":")}`,
        });
      }
    }
    return drafts;
  }

  // ---------- Graph and attention ----------

  async newConnections(userId: string, snap: Snapshot, windowDays = 14): Promise<InsightDraft[]> {
    const since = snap.now.getTime() - windowDays * DAY;
    const concrete = new Set(["asset", "company", "theme", "protocol", "person"]);
    const held = new Set(snap.nowExposure.holdings.map((h) => h.assetId));
    const edges = await this.db
      .select({ s: relationships.sourceId, t: relationships.targetId, createdAt: relationships.createdAt })
      .from(relationships)
      .where(and(eq(relationships.userId, userId), eq(relationships.inferred, false)));
    const key = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);
    const firstEdge = new Map<string, number>();
    for (const e of edges) {
      const k = key(e.s, e.t);
      firstEdge.set(k, Math.min(firstEdge.get(k) ?? Infinity, e.createdAt.getTime()));
    }
    const firstMention = new Map<string, { at: number; memory: Mem }>();
    const ordered = [...snap.memories.values()].filter(userAuthored).sort((a, b) => a.at.getTime() - b.at.getTime());
    for (const m of ordered) {
      const ids = [...(snap.mentions.get(m.id) ?? [])].filter((id) => concrete.has(snap.entities.get(id)?.type ?? ""));
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const k = key(ids[i], ids[j]);
          if (!firstMention.has(k)) firstMention.set(k, { at: m.at.getTime(), memory: m });
        }
    }
    const found: { a: string; b: string; memory: Mem; score: number }[] = [];
    for (const [k, { at, memory }] of firstMention) {
      if (at < since || at > snap.now.getTime()) continue;
      if ((firstEdge.get(k) ?? Infinity) < at) continue;
      const [a, b] = k.split(":");
      const ea = snap.entities.get(a)!;
      const eb = snap.entities.get(b)!;
      // Two themes, or a company and its own stock, are not news.
      if (ea.type === "theme" && eb.type === "theme") continue;
      const score = (held.has(a) ? 2 : 0) + (held.has(b) ? 2 : 0) + (ea.type === "theme" || eb.type === "theme" ? 1 : 0);
      found.push({ a, b, memory, score });
    }
    return found
      .sort((x, y) => y.score - x.score || y.memory.at.getTime() - x.memory.at.getTime())
      .slice(0, 3)
      .map(({ a, b, memory }) => {
        const [ea, eb] = [snap.entities.get(a)!, snap.entities.get(b)!].sort((x, y) => Number(held.has(y.id)) - Number(held.has(x.id)));
        const heldOne = held.has(ea.id) ? ea : null;
        return {
          kind: "new_connection" as const,
          title: `New link: ${assetLabel(ea)} and ${assetLabel(eb)}`,
          whatChanged: `${quote(memory.title)} (${day(memory.at)}) is the first memory that connects ${assetLabel(ea)} with ${assetLabel(eb)}.`,
          whyItMatters: heldOne
            ? `You hold ${assetLabel(heldOne)}. Until now it sat in a separate part of your graph from ${assetLabel(eb)}, so this may change what drives the position.`
            : "Until now these sat in separate parts of your graph. New links are where new ideas and hidden risks usually start.",
          evidence: [{ label: memory.title, memoryId: memory.id }],
          memoryIds: [memory.id],
          entityIds: [ea.id, eb.id],
          fingerprint: `connection:${key(a, b)}`,
        };
      });
  }

  /** Second-order exposure and look-alike holdings, from graph inference. */
  async graphInference(userId: string, snap: Snapshot): Promise<InsightDraft[]> {
    const inference = new GraphInference(this.db);
    const idx = await inference.index(userId, snap.now);
    if (!idx.held.size) return [];
    const byRecency = (ids: Iterable<string>) =>
      [...ids].map((id) => snap.memories.get(id)).filter((m): m is Mem => !!m).sort((a, b) => b.at.getTime() - a.at.getTime());
    const drafts: InsightDraft[] = [];

    // Something no holding links to directly, which still reaches a large part of the portfolio.
    for (const r of inference.reach(idx).filter((r) => !r.direct && r.share >= 0.25).slice(0, 2)) {
      const name = nodeLabel(r.source);
      const targets = r.paths.map((p) => p.target);
      const origin = originMemory(r.source);
      const evidence = byRecency(new Set([...(origin ? [origin] : []), ...(idx.mentions.get(r.source.id) ?? [])])).slice(0, 3);
      drafts.push({
        kind: "second_order",
        title: `${name} reaches ${pct(r.share)} of your portfolio`,
        whatChanged: r.paths.map((p, i) => `${describePath(i ? "It" : r.source, p.steps)} (${pct(p.share)}).`).join(" "),
        whyItMatters:
          r.source.type === "event"
            ? `None of your holdings links to this directly, yet if it plays out it reaches ${listOf(targets.map(nodeLabel))} through the chain above.`
            : `None of your holdings links to ${name} directly, so the exposure is easy to miss. Trouble at ${name} reaches ${listOf(targets.map(nodeLabel))} through the chain above.`,
        evidence: evidence.map((m) => ({ label: m.title, memoryId: m.id })),
        memoryIds: evidence.map((m) => m.id),
        entityIds: [r.source.id, ...targets.map((t) => t.id)],
        fingerprint: `chain:${r.source.id}:${targets.map((t) => t.id).sort().join(":")}`,
      });
    }

    // Two unlinked things that look alike, where at least one is a holding or the company behind one.
    const issuerOf = new Map<string, string>();
    for (const e of idx.edges) if (e.type === "derived_from" && idx.held.has(e.s)) issuerOf.set(e.t, e.s);
    const touchesHolding = (id: string) => idx.held.has(id) || issuerOf.has(id);
    const pairs = inference.similarities(idx, { min: 0.4 }).filter((s) => !s.linked && (touchesHolding(s.a.id) || touchesHolding(s.b.id)));
    for (const s of pairs.slice(0, 2)) {
      const [a, b] = [nodeLabel(s.a), nodeLabel(s.b)];
      const heldIds = [s.a.id, s.b.id].map((id) => (idx.held.has(id) ? id : issuerOf.get(id))).filter((id): id is string => !!id);
      const heldNames = heldIds.map((id) => nodeLabel(idx.nodes.get(id)!));
      const both = byRecency([...(idx.mentions.get(s.a.id) ?? [])].filter((id) => idx.mentions.get(s.b.id)?.has(id))).slice(0, 3);
      drafts.push({
        kind: "similarity",
        title: `${a} and ${b} look alike in your graph`,
        whatChanged: `${s.reason}, but nothing you saved links them to each other.`,
        whyItMatters:
          heldIds.length === 2
            ? `You hold ${listOf(heldNames)}. Positions tied to things this alike tend to move together, so they add up rather than diversify each other.`
            : `You hold ${listOf(heldNames)}. What you learn about one of these is often evidence about the other.`,
        evidence: both.map((m) => ({ label: m.title, memoryId: m.id })),
        memoryIds: both.map((m) => m.id),
        entityIds: [s.a.id, s.b.id, ...heldIds],
        fingerprint: `similar:${[s.a.id, s.b.id].sort().join(":")}`,
      });
    }
    return drafts;
  }

  mentionFrequency(snap: Snapshot): InsightDraft[] {
    const now = snap.now.getTime();
    const recentFrom = now - 14 * DAY;
    const priorFrom = now - 70 * DAY;
    const counts = new Map<string, { recent: Mem[]; prior: number }>();
    for (const m of snap.memories.values()) {
      const t = m.at.getTime();
      if (t > now || t <= priorFrom || !userAuthored(m)) continue;
      for (const id of snap.mentions.get(m.id) ?? []) {
        const e = snap.entities.get(id);
        if (!e || !["asset", "company", "theme", "protocol", "person"].includes(e.type)) continue;
        const c = counts.get(id) ?? { recent: [], prior: 0 };
        if (t > recentFrom) c.recent.push(m);
        else c.prior++;
        counts.set(id, c);
      }
    }
    const drafts: InsightDraft[] = [];
    for (const [id, c] of counts) {
      const typical = c.prior / 4; // four two-week periods before the current one
      if (c.recent.length < 3 || c.recent.length < 2 * typical + 1) continue;
      const e = snap.entities.get(id)!;
      const recent = c.recent.sort((a, b) => b.at.getTime() - a.at.getTime());
      drafts.push({
        kind: "mention_frequency",
        title: `${assetLabel(e)} keeps coming up`,
        whatChanged: `${recent.length} memories mention ${assetLabel(e)} in the last 14 days, against about ${typical.toFixed(1)} in a typical two weeks before.`,
        whyItMatters: "When something takes more of your attention, check that your thesis and position still match what you are reading.",
        evidence: recent.slice(0, 3).map((m) => ({ label: m.title, memoryId: m.id })),
        memoryIds: recent.slice(0, 3).map((m) => m.id),
        entityIds: [id],
        fingerprint: `mentions:${id}:${Math.floor(now / (14 * DAY))}`,
      });
    }
    return drafts;
  }
}

/** "under 15%", "below 20 %", "max 10%", "no more than 5%" → 0.15, 0.2, 0.1, 0.05. */
export function parseLimit(text: string): number | null {
  const m = text.match(/\b(?:under|below|less than|at most|no more than|max(?:imum)?|cap(?:ped)?(?: at)?|up to)\s+(\d{1,3}(?:\.\d+)?)\s?%/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n <= 100 ? n / 100 : null;
}
