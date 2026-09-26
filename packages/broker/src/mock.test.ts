import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDatabase, schema, type DatabaseHandle } from "@jarvis/db";
import { MockBrokerProvider, positionsFromFills } from "./mock";
import { syncBrokerAccounts } from "./sync";

let h: DatabaseHandle;
let userId: string;

beforeAll(async () => {
  h = await createDatabase({ dataDir: "memory://" });
  await h.migrate();
  [{ id: userId }] = await h.db.insert(schema.users).values({ email: "broker@example.com" }).returning();
});
afterAll(async () => h?.close());

const resolveAsset = async (a: { symbol: string; name: string }) => {
  const [row] = await h.db
    .insert(schema.entities)
    .values({ userId, type: "asset", name: a.name, slug: a.symbol.toLowerCase(), symbol: a.symbol })
    .onConflictDoUpdate({ target: [schema.entities.userId, schema.entities.type, schema.entities.slug], set: { name: a.name } })
    .returning();
  return row.id;
};

describe("MockBrokerProvider", () => {
  it("is a read-only, demo-mode provider with average-cost positions", async () => {
    const broker = new MockBrokerProvider({ now: new Date("2026-06-01T00:00:00Z") });
    expect(broker.dataMode).toBe("demo");
    expect(broker.capabilities().orders).toBe(false);
    await expect(broker.submitOrder({} as never)).rejects.toThrow(/not enabled/);
    const positions = await broker.getPositions("demo-account");
    const btc = positions.find((p) => p.symbol === "BTC")!;
    expect(btc.quantity).toBe("0.006");
    expect(btc.averageCost).toBe("60000.00");
    expect(await broker.getBalances("demo-account")).toEqual([]);
    await expect(broker.getPositions("someone-else")).rejects.toThrow();
  });

  it("computes average cost across partial sells", () => {
    const at = (d: number) => new Date(Date.UTC(2026, 0, d));
    const base = { symbol: "X", name: "X", assetClass: "equity" as const, fees: null, currency: "USD" };
    const pos = positionsFromFills([
      { ...base, id: "1", side: "buy", quantity: "10", price: "10", executedAt: at(1) },
      { ...base, id: "2", side: "buy", quantity: "10", price: "20", executedAt: at(2) },
      { ...base, id: "3", side: "sell", quantity: "5", price: "30", executedAt: at(3) },
    ]);
    expect(pos).toEqual([{ symbol: "X", name: "X", assetClass: "equity", currency: "USD", quantity: "15", averageCost: "15.00" }]);
  });
});

describe("syncBrokerAccounts", () => {
  it("imports transactions and positions idempotently, marked demo", async () => {
    const broker = new MockBrokerProvider();
    const [first] = await syncBrokerAccounts({ db: h.db, userId, provider: broker, resolveAsset });
    expect(first.transactionsAdded).toBe(5);
    expect(first.positions).toBe(4);
    const [second] = await syncBrokerAccounts({ db: h.db, userId, provider: broker, resolveAsset });
    expect(second.transactionsAdded).toBe(0);
    expect(second.portfolioId).toBe(first.portfolioId);
    expect(second.transactionIds.size).toBe(5);

    const tx = await h.db.select().from(schema.transactions).where(eq(schema.transactions.userId, userId));
    expect(tx).toHaveLength(5);
    expect(tx.every((t) => t.dataMode === "demo")).toBe(true);
    const [portfolio] = await h.db.select().from(schema.portfolios).where(eq(schema.portfolios.id, first.portfolioId));
    expect(portfolio).toMatchObject({ provider: "mock", dataMode: "demo", externalId: "demo-account" });
    expect(portfolio.syncedAt).not.toBeNull();
  });
});
