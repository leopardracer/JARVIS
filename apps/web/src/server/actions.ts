import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { AIProvider } from "@jarvis/ai";
import { ApprovalSigner, MockBrokerProvider, rebuildPositionsFromLedger, type BrokerProvider } from "@jarvis/broker";
import { schema, type Database } from "@jarvis/db";
import { exposure, parseLimit, type Exposure } from "@jarvis/knowledge";
import type { MemoryService } from "@jarvis/memory";
import { createActionSchema, type CreateActionInput } from "@jarvis/types";
import { HttpError } from "./errors";
import { retrieveContext } from "./reasoning";
import { ensureAsset } from "./theses";

export type ActionDeps = { db: Database; memory: MemoryService; ai: AIProvider; signer: ApprovalSigner };

const { actions, actionApprovals, entities, transactions, portfolios, insights, users } = schema;

const HOUR = 3_600_000;
/** How long a proposal waits for review before it lapses. */
export const PROPOSAL_TTL_MS = 72 * HOUR;
/** How long an approval stays valid for submission. */
export const APPROVAL_TTL_MS = 15 * 60_000;

export type ActionRow = typeof actions.$inferSelect;

/** What the user must type to approve, e.g. "SELL 8.27 NVDA". */
export function confirmationPhrase(a: { type: string; quantity: string | null; symbol: string | null }) {
  return `${a.type.toUpperCase()} ${trimDecimal(a.quantity ?? "0")} ${a.symbol ?? ""}`.trim();
}

const trimDecimal = (v: string) => (v.includes(".") ? v.replace(/0+$/, "").replace(/\.$/, "") : v);
const normalizePhrase = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

/** Where an action would be sent: the demo brokerage for demo users, otherwise nowhere yet. */
async function routeFor(db: Database, userId: string) {
  const [user] = await db.select({ mode: users.mode }).from(users).where(eq(users.id, userId));
  if (!user) throw new HttpError(404, "User not found");
  if (user.mode === "demo") return { provider: "mock", dataMode: "demo" as const };
  // Live connections are read-only today; an approved live action is a decision record the user carries out themselves.
  return { provider: "none", dataMode: "live" as const };
}

export function providerFor(action: Pick<ActionRow, "provider" | "dataMode">, signer: ApprovalSigner): BrokerProvider | null {
  if (action.provider === "mock" && action.dataMode === "demo") return new MockBrokerProvider({ signer });
  return null;
}

async function lastFillPrice(db: Database, userId: string, assetId: string) {
  const [row] = await db
    .select({ price: transactions.price })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.assetEntityId, assetId), sql`${transactions.price} is not null`))
    .orderBy(desc(transactions.executedAt))
    .limit(1);
  return row?.price ? trimDecimal(row.price) : null;
}

export async function createAction(
  deps: ActionDeps,
  userId: string,
  raw: CreateActionInput,
  opts: { proposedBy?: "user" | "ai"; context?: Record<string, unknown>; insightId?: string | null; now?: Date } = {},
): Promise<ActionRow> {
  const input = createActionSchema.parse(raw);
  const asset = await ensureAsset(deps.memory, userId, input.symbol);
  const route = await routeFor(deps.db, userId);
  const now = opts.now ?? new Date();
  const [row] = await deps.db
    .insert(actions)
    .values({
      userId,
      type: input.side,
      assetEntityId: asset.id,
      quantity: input.quantity,
      estimatedPrice: input.price ?? null,
      reasoning: input.reasoning,
      context: { symbol: input.symbol, ...opts.context },
      dataMode: route.dataMode,
      provider: route.provider,
      insightId: opts.insightId ?? null,
      proposedBy: opts.proposedBy ?? "user",
      expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS),
      createdAt: now,
    })
    .returning();
  await deps.memory.recordActivity(userId, "action_proposed", "action", row.id, `Proposed: ${confirmationPhrase({ type: row.type, quantity: row.quantity, symbol: input.symbol })}`);
  return row;
}

async function owned(db: Database, userId: string, id: string) {
  const [row] = await db
    .select({ action: actions, symbol: entities.symbol })
    .from(actions)
    .leftJoin(entities, eq(entities.id, actions.assetEntityId))
    .where(and(eq(actions.id, id), eq(actions.userId, userId)));
  if (!row) throw new HttpError(404, "Action not found");
  return row;
}

/** Proposals past their review window lapse; nothing is ever carried out by default. */
export async function expireStale(db: Database, userId: string, now = new Date()) {
  await db
    .update(actions)
    .set({ approvalStatus: "expired" })
    .where(and(eq(actions.userId, userId), eq(actions.approvalStatus, "proposed"), lt(actions.expiresAt, now)));
}

const fingerprint = (a: ActionRow, symbol: string | null, userId: string, at: string) =>
  createHash("sha256").update([a.id, userId, a.type, a.quantity, symbol, a.estimatedPrice ?? "", a.provider, a.dataMode, at].join("|")).digest("hex");

/**
 * Record the user's approval. Requires the exact confirmation phrase and
 * never submits anything: submission is a separate, explicit request.
 */
export async function approveAction(deps: ActionDeps, userId: string, id: string, phrase: string, now = new Date()) {
  await expireStale(deps.db, userId, now);
  const { action, symbol } = await owned(deps.db, userId, id);
  if (action.approvalStatus !== "proposed") throw new HttpError(409, `This action is ${action.approvalStatus}`);
  const expected = confirmationPhrase({ type: action.type, quantity: action.quantity, symbol });
  if (normalizePhrase(phrase) !== expected) throw new HttpError(400, `Type ${expected} exactly to approve`);
  const decidedAt = now.toISOString();
  const [approval] = await deps.db
    .insert(actionApprovals)
    .values({ actionId: id, userId, decision: "approved", phrase: phrase.trim(), confirmationHash: fingerprint(action, symbol, userId, decidedAt), decidedAt: now, expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS) })
    .returning();
  const [updated] = await deps.db
    .update(actions)
    .set({ approvalStatus: "approved" })
    .where(and(eq(actions.id, id), eq(actions.approvalStatus, "proposed")))
    .returning();
  if (!updated) throw new HttpError(409, "This action changed while you were approving it");
  await deps.memory.recordActivity(userId, "action_approved", "action", id, `Approved: ${expected}`);
  return { action: updated, approval };
}

export async function rejectAction(deps: ActionDeps, userId: string, id: string, reason?: string, now = new Date()) {
  const { action, symbol } = await owned(deps.db, userId, id);
  if (action.approvalStatus !== "proposed" && !(action.approvalStatus === "approved" && action.executionStatus === "not_started")) {
    throw new HttpError(409, `This action is ${action.approvalStatus}`);
  }
  await deps.db.insert(actionApprovals).values({ actionId: id, userId, decision: "rejected", reason: reason || null, decidedAt: now });
  const [updated] = await deps.db.update(actions).set({ approvalStatus: "rejected" }).where(eq(actions.id, id)).returning();
  await deps.memory.recordActivity(userId, "action_rejected", "action", id, `Rejected: ${confirmationPhrase({ type: action.type, quantity: action.quantity, symbol })}${reason ? `. ${reason}` : ""}`);
  return updated;
}

/**
 * Submit an approved action to its brokerage. Only called from the user's
 * own explicit request; the approval must be recent and the ticket is signed
 * so the provider can check it was not altered.
 */
export async function executeAction(deps: ActionDeps, userId: string, id: string, now = new Date()) {
  const { db, memory, signer } = deps;
  const { action, symbol } = await owned(db, userId, id);
  if (action.approvalStatus !== "approved") throw new HttpError(409, "Approve the action before submitting it");
  if (action.executionStatus !== "not_started") throw new HttpError(409, `This action is already ${action.executionStatus}`);
  const [approval] = await db
    .select()
    .from(actionApprovals)
    .where(and(eq(actionApprovals.actionId, id), eq(actionApprovals.decision, "approved")))
    .orderBy(desc(actionApprovals.decidedAt))
    .limit(1);
  if (!approval?.expiresAt || approval.expiresAt < now) {
    // Put it back in the review queue rather than acting on a stale approval.
    await db.update(actions).set({ approvalStatus: "proposed", expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS) }).where(eq(actions.id, id));
    throw new HttpError(409, "The approval expired. Review the action and approve it again");
  }
  if (approval.confirmationHash !== fingerprint(action, symbol, userId, approval.decidedAt.toISOString())) {
    throw new HttpError(409, "The action changed after it was approved. Approve it again");
  }
  const broker = providerFor(action, signer);
  if (!broker?.submitOrder || !broker.capabilities().orders) {
    throw new HttpError(422, "No connected brokerage accepts orders for this action. Place it yourself and record the trade as a memory.");
  }

  // Claim the action so a double click cannot submit twice.
  const claimed = await db
    .update(actions)
    .set({ executionStatus: "executing" })
    .where(and(eq(actions.id, id), eq(actions.executionStatus, "not_started")))
    .returning({ id: actions.id });
  if (!claimed.length) throw new HttpError(409, "This action is already being submitted");

  const ticket = signer.sign({
    actionId: action.id,
    approvalId: approval.id,
    userId,
    side: action.type as "buy" | "sell",
    symbol: symbol ?? "",
    quantity: trimDecimal(action.quantity ?? "0"),
    price: action.estimatedPrice ? trimDecimal(action.estimatedPrice) : null,
    provider: action.provider,
    dataMode: action.dataMode,
    approvedAt: approval.decidedAt.toISOString(),
    expiresAt: approval.expiresAt.toISOString(),
  });

  try {
    const result = await broker.submitOrder(ticket);
    if (result.status === "rejected") {
      const [failed] = await db.update(actions).set({ executionStatus: "failed", executionResult: { ...result, executedAt: result.executedAt.toISOString() } }).where(eq(actions.id, id)).returning();
      await memory.recordActivity(userId, "action_failed", "action", id, `Not filled: ${ticket.side.toUpperCase()} ${ticket.quantity} ${ticket.symbol}. ${result.note}`);
      return failed;
    }

    // REMEMBER: the trade becomes a memory and a ledger row, linked to the action.
    const verb = ticket.side === "buy" ? "Bought" : "Sold";
    const note = await memory.create(userId, {
      type: "trade",
      title: `${verb} ${ticket.symbol}${action.dataMode === "demo" ? " (paper)" : ""}`,
      content: `${verb} ${ticket.quantity} $${ticket.symbol}${result.averagePrice ? ` at ${result.averagePrice}` : ""} through the approved action. Why: ${action.reasoning}\n\n${result.note}`,
      source: "jarvis-action",
      tags: ["position", "action"],
    });
    let transactionId: string | null = null;
    if (result.status === "filled" && action.assetEntityId) {
      const [portfolio] = await db
        .select()
        .from(portfolios)
        .where(and(eq(portfolios.userId, userId), eq(portfolios.provider, action.provider)))
        .limit(1);
      if (portfolio) {
        const [tx] = await db
          .insert(transactions)
          .values({
            userId,
            portfolioId: portfolio.id,
            assetEntityId: action.assetEntityId,
            side: ticket.side,
            quantity: result.filledQuantity ?? ticket.quantity,
            price: result.averagePrice,
            executedAt: result.executedAt,
            dataMode: action.dataMode,
            externalId: result.externalId,
            memoryId: note.id,
          })
          .returning({ id: transactions.id });
        transactionId = tx.id;
        await rebuildPositionsFromLedger(db, portfolio.id);
      }
    }
    const [done] = await db
      .update(actions)
      .set({ executionStatus: "executed", executedAt: result.executedAt, transactionId, executionResult: { ...result, executedAt: result.executedAt.toISOString(), memoryId: note.id } })
      .where(eq(actions.id, id))
      .returning();
    await memory.recordActivity(userId, "action_executed", "action", id, `${verb} ${ticket.quantity} ${ticket.symbol}${action.dataMode === "demo" ? " (paper, demo)" : ""}`);
    return done;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const [failed] = await db.update(actions).set({ executionStatus: "failed", executionResult: { error: message } }).where(eq(actions.id, id)).returning();
    await memory.recordActivity(userId, "action_failed", "action", id, `Submission failed: ${message}`);
    return failed;
  }
}

// ---------- Proposals ----------

const precisionFor = (avgCost: number) => (avgCost >= 1000 ? 6 : 2);
const roundUp = (n: number, digits: number) => Math.ceil(n * 10 ** digits - 1e-9) / 10 ** digits;

type Suggestion = { input: CreateActionInput; context: Record<string, unknown>; insightId: string | null };

/** Rule-based: goals with a cap that the portfolio exceeds get a sell sized to meet the cap on cost basis. */
async function goalSuggestions(deps: ActionDeps, userId: string, ex: Exposure): Promise<Suggestion[]> {
  if (!ex.totalCost) return [];
  const goals = await deps.memory.list(userId, { types: ["goal"], limit: 50 });
  const out: Suggestion[] = [];
  for (const goal of goals.items) {
    const limit = parseLimit(`${goal.title} ${goal.content}`);
    if (limit === null) continue;
    const theme = goal.entities.find((e) => e.type === "theme");
    const assetIds = new Set(goal.entities.filter((e) => e.type === "asset").map((e) => e.id));
    const members = theme
      ? ex.holdings.filter((h) => ex.themes.find((t) => t.themeId === theme.id)?.assets.some((a) => a.assetId === h.assetId))
      : ex.holdings.filter((h) => assetIds.has(h.assetId));
    const cost = members.reduce((s, h) => s + h.cost, 0);
    const share = cost / ex.totalCost;
    if (!members.length || share <= limit) continue;
    // Sell x of cost basis so that (cost - x) / (total - x) = limit.
    const excess = (cost - limit * ex.totalCost) / (1 - limit);
    const target = [...members].sort((a, b) => b.cost - a.cost)[0];
    const avgCost = target.cost / target.quantity;
    const quantity = Math.min(target.quantity, roundUp(excess / avgCost, precisionFor(avgCost)));
    const after = (cost - quantity * avgCost) / (ex.totalCost - quantity * avgCost);
    const symbol = target.symbol ?? target.name;
    const price = await lastFillPrice(deps.db, userId, target.assetId);
    const label = theme?.name ?? symbol;
    const [insight] = await deps.db
      .select({ id: insights.id })
      .from(insights)
      .where(and(eq(insights.userId, userId), sql`${insights.fingerprint} like ${`goal:${goal.id}:above:%`}`))
      .orderBy(desc(insights.createdAt))
      .limit(1);
    out.push({
      input: {
        side: "sell",
        symbol,
        quantity: String(quantity),
        price,
        reasoning: `Your goal “${goal.title}” caps ${label} at ${Math.round(limit * 1000) / 10}%. It is ${(share * 100).toFixed(1)}% of cost basis. Selling ${quantity} ${symbol} brings it to about ${(after * 100).toFixed(1)}%, measured on cost basis.`,
      },
      context: {
        method: "rules",
        rule: "goal_cap",
        memoryIds: [goal.id],
        before: share,
        after,
        priceSource: price ? "your last recorded fill for this asset (illustrative, not a market quote)" : null,
      },
      insightId: insight?.id ?? null,
    });
  }
  return out;
}

const modelSuggestionSchema = z.object({
  proposals: z
    .array(
      z.object({
        side: z.enum(["buy", "sell"]),
        symbol: z.string().min(1).max(12),
        quantity: z.number().positive(),
        reasoning: z.string().min(10).max(1500),
        sourceRefs: z.array(z.string()).max(8),
      }),
    )
    .max(3),
});

/** Model-based: only with a language model, only for assets the user holds, never larger than the position. */
async function modelSuggestions(deps: ActionDeps, userId: string, ex: Exposure): Promise<Suggestion[]> {
  if (!deps.ai.isLanguageModel || !ex.holdings.length) return [];
  const context = await retrieveContext(deps, userId, "Which of my positions conflict with my goals, theses or recent evidence, and what would I do about it?");
  const holdings = ex.holdings.map((h) => `${h.symbol ?? h.name}: ${h.quantity} held, cost basis ${h.cost.toFixed(2)}`).join("\n");
  const result = await deps.ai.extract({
    system:
      "You propose at most three trades for the user to review. Propose only when a memory in the context clearly calls for it (a goal breached, a thesis abandoned, a stated exit condition met). Otherwise return an empty list. Cite memory refs like M1. Use only the quantities and figures given. The user must approve every proposal; nothing executes automatically.",
    prompt: `${context.prompt}\n\nHoldings (cost basis, no market prices):\n${holdings}`,
    schema: modelSuggestionSchema,
    schemaName: "proposals",
  });
  const refs = new Map(context.sources.filter((s) => s.kind === "memory").map((s) => [s.ref, s.id]));
  const out: Suggestion[] = [];
  for (const p of result.proposals) {
    const symbol = p.symbol.replace(/^\$/, "").toUpperCase();
    const held = ex.holdings.find((h) => (h.symbol ?? "").toUpperCase() === symbol);
    if (p.side === "sell" && (!held || p.quantity > held.quantity)) continue;
    if (p.side === "buy" && !held) continue;
    const memoryIds = p.sourceRefs.map((r) => refs.get(r)).filter((x): x is string => !!x);
    if (!memoryIds.length) continue;
    out.push({
      input: { side: p.side, symbol, quantity: String(p.quantity), price: held ? await lastFillPrice(deps.db, userId, held.assetId) : null, reasoning: p.reasoning },
      context: { method: "model", provider: deps.ai.name, model: deps.ai.model, memoryIds },
      insightId: null,
    });
  }
  return out;
}

/**
 * Ask JARVIS for proposals. Each one is stored as `proposed` and waits for
 * the user; open proposals for the same asset and side are not duplicated.
 */
export async function suggestActions(deps: ActionDeps, userId: string, now = new Date()) {
  await expireStale(deps.db, userId, now);
  const ex = await exposure(deps.db, userId);
  let suggestions = await goalSuggestions(deps, userId, ex);
  try {
    suggestions = [...suggestions, ...(await modelSuggestions(deps, userId, ex))];
  } catch (error) {
    console.error("Model proposals failed; keeping rule-based proposals", error);
  }
  const open = await deps.db
    .select({ assetId: actions.assetEntityId, type: actions.type })
    .from(actions)
    .where(and(eq(actions.userId, userId), inArray(actions.approvalStatus, ["proposed", "approved"]), eq(actions.executionStatus, "not_started")));
  const created: ActionRow[] = [];
  for (const s of suggestions) {
    const asset = await ensureAsset(deps.memory, userId, String(s.input.symbol).toUpperCase());
    if (open.some((o) => o.assetId === asset.id && o.type === s.input.side)) continue;
    const row = await createAction(deps, userId, s.input, { proposedBy: "ai", context: s.context, insightId: s.insightId, now });
    open.push({ assetId: asset.id, type: row.type });
    created.push(row);
  }
  return created;
}

// ---------- Views ----------

export async function actionsView(db: Database, userId: string) {
  await expireStale(db, userId);
  const rows = await db
    .select({ action: actions, symbol: entities.symbol, name: entities.name })
    .from(actions)
    .leftJoin(entities, eq(entities.id, actions.assetEntityId))
    .where(eq(actions.userId, userId))
    .orderBy(desc(actions.createdAt))
    .limit(100);
  return rows.map((r) => ({ ...r.action, symbol: r.symbol, assetName: r.name, phrase: confirmationPhrase({ type: r.action.type, quantity: r.action.quantity, symbol: r.symbol }) }));
}

export async function actionDetail(db: Database, userId: string, id: string) {
  await expireStale(db, userId);
  const [row] = await db
    .select({ action: actions, symbol: entities.symbol, name: entities.name })
    .from(actions)
    .leftJoin(entities, eq(entities.id, actions.assetEntityId))
    .where(and(eq(actions.id, id), eq(actions.userId, userId)));
  if (!row) return null;
  const a = row.action;
  const approvals = await db.select().from(actionApprovals).where(eq(actionApprovals.actionId, id)).orderBy(desc(actionApprovals.decidedAt));
  const memoryIds = Array.isArray(a.context.memoryIds) ? (a.context.memoryIds as string[]) : [];
  const evidence = memoryIds.length
    ? await db.select({ id: schema.memories.id, title: schema.memories.title, type: schema.memories.type }).from(schema.memories).where(and(eq(schema.memories.userId, userId), inArray(schema.memories.id, memoryIds)))
    : [];
  const [insight] = a.insightId ? await db.select().from(insights).where(and(eq(insights.id, a.insightId), eq(insights.userId, userId))) : [];

  // Impact on theme exposure, on cost basis, if the action were carried out.
  // Once executed, measure from the moment before the fill so the fill is not counted twice.
  const ex = await exposure(db, userId, a.executedAt ? new Date(a.executedAt.getTime() - 1) : undefined);
  const qty = Number(a.quantity ?? 0);
  const holding = ex.holdings.find((h) => h.assetId === a.assetEntityId);
  const avgCost = holding && holding.quantity ? holding.cost / holding.quantity : Number(a.estimatedPrice ?? 0);
  const delta = a.type === "sell" ? -Math.min(qty, holding?.quantity ?? 0) * avgCost : qty * Number(a.estimatedPrice ?? avgCost);
  const totalAfter = ex.totalCost + delta;
  const impact = ex.themes
    .filter((t) => t.assets.some((x) => x.assetId === a.assetEntityId))
    .map((t) => ({ theme: t.theme, before: t.share, after: totalAfter > 0 ? (t.cost + delta) / totalAfter : 0 }));

  return {
    ...a,
    symbol: row.symbol,
    assetName: row.name,
    phrase: confirmationPhrase({ type: a.type, quantity: a.quantity, symbol: row.symbol }),
    approvals,
    evidence,
    insight: insight ?? null,
    held: holding ? { quantity: holding.quantity, cost: holding.cost } : null,
    impact,
    canExecute: a.provider === "mock" && a.dataMode === "demo",
  };
}

export async function pendingActionCount(db: Database, userId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(actions)
    .where(and(eq(actions.userId, userId), eq(actions.approvalStatus, "proposed"), isNull(actions.executedAt)));
  return Number(row?.n ?? 0);
}
