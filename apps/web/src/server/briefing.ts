import { and, desc, eq, gt, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
import type { AIProvider } from "@jarvis/ai";
import { schema, type BriefingItem, type BriefingSection, type Database } from "@jarvis/db";
import { exposure } from "@jarvis/knowledge";
import type { BriefingPeriod } from "@jarvis/types";
import { confirmationPhrase } from "./actions";

const { actions, agents, briefings, entities, insights, memories, memoryEntities, relationships, research, theses, thesisAssets, thesisMemories, transactions, watchlists, watchlistItems } = schema;

const DAY = 86_400_000;
export const BRIEFING_WINDOW_MS: Record<BriefingPeriod, number> = { daily: DAY, weekly: 7 * DAY };
/** A briefing older than this is rebuilt when opened. */
const FRESH_MS = 30 * 60_000;
const STALE_THESIS_DAYS = 45;
const PER_SECTION = 5;

export type BriefingRow = typeof briefings.$inferSelect;
type Deps = { db: Database; ai: AIProvider };

/** Daily briefings start at midnight UTC, weekly ones on Monday. */
export function periodStart(period: BriefingPeriod, now: Date) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === "weekly") d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const firstSentence = (s: string) => (s.match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim();
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * How much something matters to this user: its share of the portfolio (held
 * directly or through a theme), how often they write about it, and how
 * strongly they hold a thesis on it. Used only to order a briefing.
 */
async function relevance(db: Database, userId: string, now: Date) {
  const ex = await exposure(db, userId, now);
  const weight = new Map<string, number>();
  const add = (id: string, w: number) => weight.set(id, (weight.get(id) ?? 0) + w);
  for (const h of ex.holdings) add(h.assetId, ex.totalCost ? h.cost / ex.totalCost : 0);
  for (const t of ex.themes) add(t.themeId, t.share / 2);
  const attention = await db
    .select({ id: memoryEntities.entityId, n: sql<number>`count(*)::int` })
    .from(memoryEntities)
    .innerJoin(memories, eq(memories.id, memoryEntities.memoryId))
    .where(and(eq(memories.userId, userId), gt(memories.createdAt, new Date(now.getTime() - 90 * DAY)), sql`${memories.source} not like 'jarvis%'`))
    .groupBy(memoryEntities.entityId);
  const top = Math.max(1, ...attention.map((a) => Number(a.n)));
  for (const a of attention) add(a.id, (0.5 * Number(a.n)) / top);
  const conviction = await db
    .select({ id: thesisAssets.assetEntityId, c: theses.conviction })
    .from(thesisAssets)
    .innerJoin(theses, eq(theses.id, thesisAssets.thesisId))
    .where(and(eq(theses.userId, userId), eq(theses.status, "active")));
  for (const c of conviction) add(c.id, (0.3 * c.c) / 5);
  return { exposure: ex, score: (ids: (string | null | undefined)[]) => Math.max(0, ...ids.map((id) => (id ? weight.get(id) ?? 0 : 0))) };
}

/**
 * Gather what happened in the window from the user's own records: decisions
 * waiting, trades and exposure shifts, insights, agent findings, new links in
 * the graph and what they have been writing about. Every item points back to
 * the record it came from; nothing is fetched from outside.
 */
export async function gatherBriefing(db: Database, userId: string, period: BriefingPeriod, now = new Date()): Promise<BriefingSection[]> {
  const from = new Date(now.getTime() - BRIEFING_WINDOW_MS[period]);
  const rel = await relevance(db, userId, now);
  const sections: BriefingSection[] = [];

  // ---------- Needs your decision ----------
  const needs: BriefingItem[] = [];
  const open = await db
    .select({ a: actions, symbol: entities.symbol })
    .from(actions)
    .leftJoin(entities, eq(entities.id, actions.assetEntityId))
    .where(and(eq(actions.userId, userId), inArray(actions.approvalStatus, ["proposed", "approved"]), ne(actions.executionStatus, "executed"), lte(actions.createdAt, now)));
  for (const { a, symbol } of open) {
    if (a.expiresAt && a.expiresAt <= now && a.approvalStatus === "proposed") continue;
    const phrase = confirmationPhrase({ type: a.type, quantity: a.quantity, symbol });
    needs.push({
      text: a.approvalStatus === "approved" ? `Submit or reject ${phrase}` : `Review ${phrase}`,
      detail: firstSentence(a.reasoning),
      href: `/app/actions/${a.id}`,
      entityIds: a.assetEntityId ? [a.assetEntityId] : [],
      score: 2 + rel.score([a.assetEntityId]),
    });
  }
  const thesisRows = await db
    .select({
      t: theses,
      against: sql<number>`(select count(*)::int from ${thesisMemories} where ${thesisMemories.thesisId} = ${theses.id} and ${thesisMemories.relation} = 'contradicts')`,
      support: sql<number>`(select count(*)::int from ${thesisMemories} where ${thesisMemories.thesisId} = ${theses.id} and ${thesisMemories.relation} = 'supports')`,
      assets: sql<string[]>`(select coalesce(array_agg(${thesisAssets.assetEntityId}::text), '{}') from ${thesisAssets} where ${thesisAssets.thesisId} = ${theses.id})`,
    })
    .from(theses)
    .where(and(eq(theses.userId, userId), eq(theses.status, "active")));
  for (const { t, against, support, assets } of thesisRows) {
    const ids = assets ?? [];
    if (Number(against) > Number(support)) {
      needs.push({
        text: `“${t.title}” has more evidence against than for`,
        detail: `${against} against, ${support} for, at conviction ${t.conviction}/5. Revisit it or record why the evidence does not change it.`,
        href: `/app/research/theses/${t.id}`,
        entityIds: ids,
        score: 1 + rel.score(ids),
      });
    } else if (t.updatedAt.getTime() < now.getTime() - STALE_THESIS_DAYS * DAY) {
      needs.push({
        text: `“${t.title}” has not been reviewed since ${dateFmt.format(t.updatedAt)}`,
        detail: "Check it still says what you believe.",
        href: `/app/research/theses/${t.id}`,
        entityIds: ids,
        score: 0.5 + rel.score(ids),
      });
    }
  }
  sections.push({ key: "decisions", title: "Needs your decision", items: needs });

  // ---------- What changed ----------
  const changes: BriefingItem[] = [];
  const trades = await db
    .select({ tx: transactions, symbol: entities.symbol })
    .from(transactions)
    .innerJoin(entities, eq(entities.id, transactions.assetEntityId))
    .where(and(eq(transactions.userId, userId), gt(transactions.executedAt, from), lte(transactions.executedAt, now)))
    .orderBy(desc(transactions.executedAt));
  for (const { tx, symbol } of trades) {
    changes.push({
      kind: "trade",
      text: `${tx.side === "buy" ? "Bought" : "Sold"} ${Number(tx.quantity)} ${symbol}${tx.dataMode === "demo" ? " (demo)" : ""}`,
      detail: `${dateFmt.format(tx.executedAt)}${tx.price ? ` at $${Number(tx.price).toLocaleString("en-US")}` : ""}`,
      memoryId: tx.memoryId ?? undefined,
      href: tx.memoryId ? `/app/memory?id=${tx.memoryId}` : "/app/portfolio",
      entityIds: [tx.assetEntityId],
      // The user's own trades lead: they are facts, not findings.
      score: 2 + rel.score([tx.assetEntityId]),
    });
  }
  const then = await exposure(db, userId, from);
  const before = new Map(then.themes.map((t) => [t.themeId, t.share]));
  for (const t of rel.exposure.themes) {
    const was = before.get(t.themeId) ?? 0;
    if (Math.abs(t.share - was) < 0.01) continue;
    changes.push({ kind: "exposure", text: `${t.theme}: ${pct(was)} → ${pct(t.share)} of cost basis`, href: "/app/portfolio", entityIds: [t.themeId], score: 0.5 + Math.abs(t.share - was) * 5 });
  }
  const fresh = await db
    .select()
    .from(insights)
    .where(and(eq(insights.userId, userId), ne(insights.status, "dismissed"), gt(insights.createdAt, from), lte(insights.createdAt, now)));
  for (const i of fresh) {
    changes.push({
      kind: "insight",
      text: i.title,
      detail: firstSentence(i.whyItMatters),
      href: `/app/insights?kind=${i.kind}`,
      memoryId: i.memoryIds[0],
      entityIds: i.entityIds,
      score: 0.8 + rel.score(i.entityIds) + (i.status === "new" ? 0.2 : 0),
    });
  }
  sections.push({ key: "changes", title: "What changed", items: changes });

  // ---------- From your agents ----------
  const runs = await db
    .select({ r: research, name: agents.name })
    .from(research)
    .innerJoin(agents, eq(agents.id, research.agentId))
    .where(and(eq(research.userId, userId), isNotNull(research.agentId), gt(research.createdAt, from), lte(research.createdAt, now)))
    .orderBy(desc(research.createdAt));
  const agentItems: BriefingItem[] = [];
  const quiet = new Set<string>();
  const seen = new Set<string>();
  for (const { r, name } of runs) {
    if (seen.has(r.agentId!)) continue;
    seen.add(r.agentId!);
    if (r.status !== "done") {
      if (r.status === "unchanged") quiet.add(name);
      continue;
    }
    const finding = (r.summary ?? "").split("\n").map((l) => l.replace(/^[-*]\s*/, "").replace(/\[[ME]\d+\]\s*/g, "").trim()).find((l) => l && !/^(findings|against|gaps)\b/i.test(l));
    // Offline briefs quote notes as "Title (date): first sentence"; lead with the note's title.
    const quoted = finding?.match(/^(.+?) \((\d{4}-\d{2}-\d{2})\): (.+)$/);
    agentItems.push({
      text: quoted ? `${name} points to “${quoted[1]}”` : `${name}: ${finding ?? "new brief"}`,
      detail: quoted ? quoted[3] : r.query,
      href: r.memoryId ? `/app/memory?id=${r.memoryId}` : "/app/research",
      memoryId: r.memoryId ?? undefined,
      score: 1,
    });
  }
  if (quiet.size) agentItems.push({ text: `Nothing new for ${[...quiet].join(", ")}`, detail: "No memory they rely on changed since their last run.", href: "/app/research#agents", score: 0 });
  sections.push({ key: "agents", title: "From your agents", items: agentItems });

  // ---------- In your graph ----------
  const graph: BriefingItem[] = [];
  const inferred = await db
    .select({ r: relationships, a: sql<string>`(select coalesce(symbol, name) from ${entities} where id = ${relationships.sourceId})`, b: sql<string>`(select coalesce(symbol, name) from ${entities} where id = ${relationships.targetId})` })
    .from(relationships)
    .where(and(eq(relationships.userId, userId), eq(relationships.inferred, true)));
  for (const { r, a, b } of inferred) {
    graph.push({ text: `${a} and ${b} look alike`, detail: r.reason ?? undefined, href: `/app/graph?focus=${r.sourceId}`, entityIds: [r.sourceId, r.targetId], score: 0.3 + rel.score([r.sourceId, r.targetId]) });
  }
  const firstSeen = await db
    .select({ e: entities, first: sql<Date>`min(${memories.createdAt})` })
    .from(entities)
    .innerJoin(memoryEntities, eq(memoryEntities.entityId, entities.id))
    .innerJoin(memories, eq(memories.id, memoryEntities.memoryId))
    .where(and(eq(entities.userId, userId), inArray(entities.type, ["asset", "company", "theme", "protocol", "person"])))
    .groupBy(entities.id);
  for (const { e, first } of firstSeen) {
    const at = new Date(first);
    if (at <= from || at > now) continue;
    graph.push({ text: `First mention: ${e.symbol ?? e.name}`, detail: `New ${e.type} in your graph since ${dateFmt.format(from)}.`, href: `/app/graph?focus=${e.id}`, entityIds: [e.id], score: 0.4 });
  }
  sections.push({ key: "graph", title: "In your graph", items: graph });

  // ---------- On your mind ----------
  const mind: BriefingItem[] = [];
  const written = await db
    .select({ id: memories.id, title: memories.title })
    .from(memories)
    .where(and(eq(memories.userId, userId), gt(memories.createdAt, from), lte(memories.createdAt, now), sql`${memories.source} not like 'jarvis%'`));
  if (written.length) {
    const counts = await db
      .select({ id: entities.id, name: sql<string>`coalesce(${entities.symbol}, ${entities.name})`, n: sql<number>`count(*)::int` })
      .from(memoryEntities)
      .innerJoin(entities, eq(entities.id, memoryEntities.entityId))
      .where(and(inArray(memoryEntities.memoryId, written.map((w) => w.id)), inArray(entities.type, ["asset", "company", "theme", "protocol", "person"])))
      .groupBy(entities.id, entities.symbol, entities.name)
      .orderBy(desc(sql`count(*)`))
      .limit(3);
    mind.push({
      text: `You saved ${plural(written.length, "memory", "memories")}${counts.length ? `; ${counts.map((c) => c.name).join(", ")} came up most` : ""}`,
      detail: written.slice(0, 3).map((w) => w.title).join(" · "),
      href: "/app/memory",
      entityIds: counts.map((c) => c.id),
      score: 2,
    });
    const watched = await db
      .select({ id: watchlistItems.assetEntityId, note: watchlistItems.note, symbol: entities.symbol })
      .from(watchlistItems)
      .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
      .innerJoin(entities, eq(entities.id, watchlistItems.assetEntityId))
      .where(eq(watchlists.userId, userId));
    const mentioned = new Set(counts.map((c) => c.id));
    for (const w of watched) {
      if (!mentioned.has(w.id) || !w.note) continue;
      mind.push({ text: `${w.symbol} is on your watchlist: ${w.note}`, href: "/app/watchlist", entityIds: [w.id], score: 0.4 + rel.score([w.id]) });
    }
  }
  sections.push({ key: "mind", title: "On your mind", items: mind });

  return sections
    .map((s) => ({ ...s, items: s.items.sort((a, b) => b.score - a.score).slice(0, PER_SECTION) }))
    .filter((s) => s.items.length);
}

/** Two or three sentences from the items alone. */
export function offlineLede(sections: BriefingSection[], period: BriefingPeriod): string {
  const get = (k: string) => sections.find((s) => s.key === k)?.items ?? [];
  const when = period === "daily" ? "Today" : "This week";
  const parts: string[] = [];
  const decisions = get("decisions");
  if (decisions.length) parts.push(`${plural(decisions.length, "thing needs", "things need")} your decision, starting with: ${decisions[0].text}.`);
  const changes = get("changes");
  const finding = changes.find((i) => i.kind !== "trade");
  if (finding) parts.push(`Most important change: ${finding.text.replace(/\.$/, "")}.`);
  const trades = changes.filter((i) => i.kind === "trade").length;
  if (trades) parts.push(`You made ${plural(trades, "trade")}.`);
  const agents = get("agents").filter((i) => !i.text.startsWith("Nothing new"));
  if (agents.length) parts.push(`${plural(agents.length, "agent")} found something new.`);
  if (!parts.length) return `${when} was quiet: nothing changed in your memory, portfolio or graph.`;
  return `${when}: ${parts.join(" ")}`;
}

const SYSTEM = `You are JARVIS, the user's financial second brain, opening their briefing.
Write two or three short sentences that tell the user what matters most, using only the items given.
Lead with anything that needs their decision. Do not add facts, figures, prices or advice that are not in the items. Plain language, no headings, no lists.`;

/** Build (or rebuild) the briefing for the period that contains `now`. */
export async function buildBriefing(deps: Deps, userId: string, period: BriefingPeriod, now = new Date()): Promise<BriefingRow> {
  const { db, ai } = deps;
  const sections = await gatherBriefing(db, userId, period, now);
  let lede = offlineLede(sections, period);
  let provider: string | null = null;
  let model: string | null = null;
  if (ai.isLanguageModel && sections.length) {
    try {
      const items = sections.map((s) => `${s.title}:\n${s.items.map((i) => `- ${i.text}${i.detail ? ` (${i.detail})` : ""}`).join("\n")}`).join("\n\n");
      const out = (await ai.complete({ system: SYSTEM, messages: [{ role: "user", content: items }], maxTokens: 300 })).text.trim();
      if (out) ({ lede, provider, model } = { lede: out, provider: ai.name, model: ai.model });
    } catch (error) {
      console.error("Briefing lede failed; using the offline lede", error);
    }
  }
  const start = periodStart(period, now);
  const [row] = await db
    .insert(briefings)
    .values({ userId, period, periodStart: start, periodEnd: now, lede, sections, provider, model, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [briefings.userId, briefings.period, briefings.periodStart], set: { periodEnd: now, lede, sections, provider, model, updatedAt: now } })
    .returning();
  return row;
}

/** The current briefing, rebuilt when it is older than half an hour. */
export async function currentBriefing(deps: Deps, userId: string, period: BriefingPeriod, now = new Date()): Promise<BriefingRow> {
  const [row] = await deps.db
    .select()
    .from(briefings)
    .where(and(eq(briefings.userId, userId), eq(briefings.period, period), eq(briefings.periodStart, periodStart(period, now))));
  if (row && now.getTime() - row.updatedAt.getTime() < FRESH_MS) return row;
  return buildBriefing(deps, userId, period, now);
}

export async function briefingHistory(db: Database, userId: string, period: BriefingPeriod, limit = 8) {
  return db
    .select({ id: briefings.id, periodStart: briefings.periodStart, periodEnd: briefings.periodEnd, lede: briefings.lede })
    .from(briefings)
    .where(and(eq(briefings.userId, userId), eq(briefings.period, period)))
    .orderBy(desc(briefings.periodStart))
    .limit(limit);
}

export async function briefingById(db: Database, userId: string, id: string) {
  const [row] = await db.select().from(briefings).where(and(eq(briefings.id, id), eq(briefings.userId, userId)));
  return row ?? null;
}
