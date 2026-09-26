import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { ApprovalSigner, SecretBox } from "@jarvis/broker";
import { createDatabase, schema, type DatabaseHandle } from "@jarvis/db";
import { HashEmbeddingProvider, MockProvider } from "@jarvis/ai";
import { InsightEngine } from "@jarvis/knowledge";
import { MemoryService, seedDemo } from "@jarvis/memory";
import { actionDetail, approveAction, APPROVAL_TTL_MS, confirmationPhrase, createAction, executeAction, PROPOSAL_TTL_MS, rejectAction, suggestActions, type ActionDeps } from "./actions";
import { addWalletConnection, listConnections, syncConnection } from "./connections";

let h: DatabaseHandle;
let deps: ActionDeps;
let demoUser: string;
let liveUser: string;
const master = randomBytes(32);

beforeAll(async () => {
  h = await createDatabase({ dataDir: "memory://" });
  await h.migrate();
  const ai = new MockProvider();
  const memory = new MemoryService({ db: h.db, ai, embedder: new HashEmbeddingProvider(), llmExtraction: false });
  deps = { db: h.db, memory, ai, signer: new ApprovalSigner(master) };
  demoUser = (await seedDemo(h.db, memory)).userId;
  [{ id: liveUser }] = await h.db.insert(schema.users).values({ email: "live@example.com", mode: "live" }).returning();
});
afterAll(async () => h?.close());

const status = async (id: string) => (await h.db.select().from(schema.actions).where(eq(schema.actions.id, id)))[0];

describe("proposals", () => {
  it("turns a breached position-size goal into one sell proposal, sized on cost basis", async () => {
    const insights = await h.db.select().from(schema.insights).where(eq(schema.insights.userId, demoUser));
    expect(insights.map((i) => i.title)).toContain("NVDA is above your 40% cap");

    const [proposal] = await suggestActions(deps, demoUser);
    expect(proposal).toMatchObject({ type: "sell", proposedBy: "ai", approvalStatus: "proposed", executionStatus: "not_started", provider: "mock", dataMode: "demo" });
    // NVDA is 3,000 of 6,260 cost basis; selling 8.27 at $100 average cost brings it to 40%.
    expect(Number(proposal.quantity)).toBe(8.27);
    expect(Number(proposal.estimatedPrice)).toBe(100);
    expect(proposal.reasoning).toContain("Keep $NVDA under 40% of the portfolio");
    expect(proposal.insightId).not.toBeNull();
    expect(await suggestActions(deps, demoUser)).toEqual([]);

    const detail = await actionDetail(h.db, demoUser, proposal.id);
    expect(detail!.phrase).toBe("SELL 8.27 NVDA");
    expect(detail!.evidence.map((e) => e.title)).toEqual(["Keep $NVDA under 40% of the portfolio"]);
    const ai = detail!.impact.find((i) => i.theme === "AI infrastructure")!;
    expect(ai.after).toBeLessThan(ai.before);
  });
});

describe("approval and execution", () => {
  it("needs the exact phrase, then a separate submit, and remembers the trade", async () => {
    const [a] = await h.db.select().from(schema.actions).where(eq(schema.actions.userId, demoUser));
    await expect(executeAction(deps, demoUser, a.id)).rejects.toThrow(/Approve the action/);
    await expect(approveAction(deps, demoUser, a.id, "SELL 82.7 NVDA")).rejects.toThrow(/Type SELL 8.27 NVDA exactly/);
    await expect(approveAction(deps, liveUser, a.id, "SELL 8.27 NVDA")).rejects.toThrow(/not found/);

    const { approval } = await approveAction(deps, demoUser, a.id, "  sell 8.27   nvda ");
    expect(approval.confirmationHash).toMatch(/^[0-9a-f]{64}$/);
    // Approval alone changes nothing in the portfolio.
    expect((await status(a.id)).executionStatus).toBe("not_started");

    const done = await executeAction(deps, demoUser, a.id);
    expect(done.executionStatus).toBe("executed");
    expect(done.executionResult).toMatchObject({ status: "filled", averagePrice: "100" });
    const [tx] = await h.db.select().from(schema.transactions).where(eq(schema.transactions.id, done.transactionId!));
    expect(tx).toMatchObject({ side: "sell", dataMode: "demo", externalId: `paper-${a.id}` });
    const note = await deps.memory.get(demoUser, tx.memoryId!);
    expect(note).toMatchObject({ type: "trade", title: "Sold NVDA (paper)" });
    const positions = await h.db.select().from(schema.positions).where(eq(schema.positions.assetEntityId, tx.assetEntityId));
    expect(Number(positions[0].quantity)).toBeCloseTo(21.73, 6);
    // The review page still shows the order's effect from before the fill, not a second sale.
    const after = await actionDetail(h.db, demoUser, a.id);
    expect(after!.held!.quantity).toBe(30);
    expect(after!.impact.find((i) => i.theme === "AI infrastructure")!.before).toBeCloseTo(5400 / 6260, 6);

    await expect(executeAction(deps, demoUser, a.id)).rejects.toThrow(/already executed/);
    await expect(rejectAction(deps, demoUser, a.id)).rejects.toThrow(/approved/);
  });

  it("refuses stale or altered approvals", async () => {
    const t0 = new Date();
    const a = await createAction(deps, demoUser, { side: "buy", symbol: "AMD", quantity: "1", price: "120", reasoning: "Test" }, { now: t0 });
    await approveAction(deps, demoUser, a.id, "BUY 1 AMD", t0);
    await expect(executeAction(deps, demoUser, a.id, new Date(t0.getTime() + APPROVAL_TTL_MS + 1000))).rejects.toThrow(/approval expired/);
    expect((await status(a.id)).approvalStatus).toBe("proposed");

    await approveAction(deps, demoUser, a.id, "BUY 1 AMD");
    await h.db.update(schema.actions).set({ quantity: "100" }).where(eq(schema.actions.id, a.id));
    await expect(executeAction(deps, demoUser, a.id)).rejects.toThrow(/changed after it was approved/);
    expect((await status(a.id)).executionStatus).toBe("not_started");
  });

  it("lets proposals lapse and records rejections", async () => {
    const t0 = new Date(Date.now() - PROPOSAL_TTL_MS - 60_000);
    const old = await createAction(deps, demoUser, { side: "sell", symbol: "ETH", quantity: "0.1", reasoning: "Old idea" }, { now: t0 });
    await expect(approveAction(deps, demoUser, old.id, "SELL 0.1 ETH")).rejects.toThrow(/expired/);

    const b = await createAction(deps, demoUser, { side: "sell", symbol: "BTC", quantity: "0.001", reasoning: "Maybe" });
    const rejected = await rejectAction(deps, demoUser, b.id, "Not now");
    expect(rejected.approvalStatus).toBe("rejected");
    const decisions = await h.db.select().from(schema.actionApprovals).where(and(eq(schema.actionApprovals.actionId, b.id)));
    expect(decisions).toMatchObject([{ decision: "rejected", reason: "Not now" }]);
  });

  it("records live decisions but never submits without an order-capable brokerage", async () => {
    const a = await createAction(deps, liveUser, { side: "buy", symbol: "ETH", quantity: "0.5", reasoning: "Add to the settlement-layer thesis" });
    expect(a).toMatchObject({ provider: "none", dataMode: "live" });
    await approveAction(deps, liveUser, a.id, confirmationPhrase({ type: "buy", quantity: a.quantity, symbol: "ETH" }));
    await expect(executeAction(deps, liveUser, a.id)).rejects.toThrow(/No connected brokerage accepts orders/);
    expect((await status(a.id)).executionStatus).toBe("not_started");
  });

  it("never proposes on its own: the engine only reports", async () => {
    const before = await h.db.select().from(schema.actions);
    await new InsightEngine(h.db).run(demoUser);
    expect(await h.db.select().from(schema.actions)).toHaveLength(before.length);
  });
});

describe("connections", () => {
  const address = "0x2222222222222222222222222222222222222222";
  const secrets = new SecretBox(master);

  it("keeps demo and live apart and never exposes credentials", async () => {
    await expect(addWalletConnection({ ...deps, secrets }, demoUser, { address })).rejects.toThrow(/demo workspace cannot connect/);
    const id = await addWalletConnection({ ...deps, secrets }, liveUser, { address, network: "testnet" });
    const [row] = await h.db.select().from(schema.brokerConnections).where(eq(schema.brokerConnections.id, id));
    expect(row.encryptedCredentials).not.toContain(address.slice(2));
    const listed = await listConnections(h.db, liveUser);
    expect(listed[0]).not.toHaveProperty("encryptedCredentials");
    expect(listed[0].metadata).toMatchObject({ address: "0x2222…2222", readOnly: true });

    const result = await syncConnection({ ...deps, secrets }, liveUser, id, { client: { getBalance: async () => 2_000_000_000_000_000_000n } });
    expect(result.positions).toBe(1);
    const [portfolio] = await h.db.select().from(schema.portfolios).where(eq(schema.portfolios.id, result.portfolioId));
    expect(portfolio).toMatchObject({ provider: "robinhood-chain", dataMode: "live" });

    await expect(syncConnection({ ...deps, secrets }, liveUser, id, { client: { getBalance: async () => { throw new Error("rpc down"); } } })).rejects.toThrow(/rpc down/);
    expect((await listConnections(h.db, liveUser))[0]).toMatchObject({ status: "error", lastError: "rpc down" });
  });
});
