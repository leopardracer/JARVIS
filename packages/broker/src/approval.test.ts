import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ApprovalSigner, type OrderTicket } from "./approval";
import { MockBrokerProvider } from "./mock";
import { RobinhoodChainProvider } from "./robinhood-chain-provider";
import { masterKeyFromEnv, SecretBox } from "./secrets";

const master = randomBytes(32);
const ticket = (over: Partial<OrderTicket> = {}): OrderTicket => ({
  actionId: "a1",
  approvalId: "p1",
  userId: "u1",
  side: "sell",
  symbol: "NVDA",
  quantity: "8.27",
  price: "100",
  provider: "mock",
  dataMode: "demo",
  approvedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  ...over,
});

describe("SecretBox", () => {
  it("round-trips, and rejects tampering or the wrong key", () => {
    const box = new SecretBox(master);
    const sealed = box.seal({ apiKey: "k", privateKey: "secret" });
    expect(sealed).not.toContain("secret");
    expect(box.open(sealed)).toEqual({ apiKey: "k", privateKey: "secret" });
    expect(box.seal("x")).not.toBe(box.seal("x"));
    const parts = sealed.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => box.open(parts.join(":"))).toThrow();
    expect(() => new SecretBox(randomBytes(32)).open(sealed)).toThrow();
    expect(() => new SecretBox(randomBytes(16))).toThrow(/32 bytes/);
  });

  it("requires a configured key in production and creates a private dev key otherwise", () => {
    expect(() => masterKeyFromEnv({ NODE_ENV: "production" })).toThrow(/JARVIS_ENCRYPTION_KEY/);
    expect(() => masterKeyFromEnv({ JARVIS_ENCRYPTION_KEY: "c2hvcnQ=" })).toThrow(/32 bytes/);
    const configured = randomBytes(32);
    expect(masterKeyFromEnv({ JARVIS_ENCRYPTION_KEY: configured.toString("base64") }).equals(configured)).toBe(true);
    const dir = mkdtempSync(path.join(tmpdir(), "jarvis-key-"));
    const a = masterKeyFromEnv({}, { devKeyDir: dir });
    expect(masterKeyFromEnv({}, { devKeyDir: dir }).equals(a)).toBe(true);
    const file = path.join(dir, "dev-encryption.key");
    expect(readFileSync(file, "utf8").trim()).toBe(a.toString("base64"));
    expect(statSync(file).mode & 0o077).toBe(0);
  });
});

describe("ApprovalSigner", () => {
  const signer = new ApprovalSigner(master);
  const expectMock = { provider: "mock", dataMode: "demo" as const };

  it("accepts an untouched approval inside its window", () => {
    expect(() => signer.verify(signer.sign(ticket()), expectMock)).not.toThrow();
  });

  it("rejects edited, forged, expired or misrouted orders", () => {
    const signed = signer.sign(ticket());
    expect(() => signer.verify({ ...signed, quantity: "80" }, expectMock)).toThrow(/valid user approval/);
    expect(() => signer.verify({ ...ticket(), signature: "" }, expectMock)).toThrow(/valid user approval/);
    expect(() => new ApprovalSigner(randomBytes(32)).verify(signed, expectMock)).toThrow(/valid user approval/);
    const expired = signer.sign(ticket({ expiresAt: new Date(Date.now() - 1000).toISOString() }));
    expect(() => signer.verify(expired, expectMock)).toThrow(/expired/);
    expect(() => signer.verify(signed, { provider: "robinhood-crypto", dataMode: "demo" })).toThrow(/approved for mock/);
    const live = signer.sign(ticket({ dataMode: "live" }));
    expect(() => signer.verify(live, expectMock)).toThrow(/live order cannot go to a demo/);
  });

  it("lets the demo brokerage paper-fill only approved orders, at the ticket price", async () => {
    const broker = new MockBrokerProvider({ signer });
    expect(broker.capabilities().orders).toBe(true);
    const fill = await broker.submitOrder(signer.sign(ticket()));
    expect(fill).toMatchObject({ status: "filled", filledQuantity: "8.27", averagePrice: "100" });
    await expect(broker.submitOrder({ ...ticket(), signature: "forged" })).rejects.toThrow(/valid user approval/);
    const noPrice = await broker.submitOrder(signer.sign(ticket({ price: null })));
    expect(noPrice.status).toBe("rejected");
  });
});

describe("RobinhoodChainProvider", () => {
  it("reads the native balance as a live position without a cost basis", async () => {
    const address = "0x1111111111111111111111111111111111111111";
    const chain = new RobinhoodChainProvider(address, "testnet", { getBalance: async () => 1_500_000_000_000_000_000n });
    expect(chain.dataMode).toBe("live");
    expect(chain.capabilities().orders).toBe(false);
    expect("submitOrder" in chain).toBe(false);
    const [account] = await chain.getAccounts();
    expect(account.id).toBe(`46630:${address}`);
    expect(await chain.getPositions()).toEqual([{ symbol: "ETH", name: "Ether", assetClass: "crypto", quantity: "1.5", averageCost: null, currency: "USD" }]);
    const empty = new RobinhoodChainProvider(address, "testnet", { getBalance: async () => 0n });
    expect(await empty.getPositions()).toEqual([]);
  });
});
