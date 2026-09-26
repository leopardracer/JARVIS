import type { ApprovalSigner, ApprovedAction } from "./approval";
import type {
  BrokerAccount,
  BrokerBalance,
  BrokerCapabilities,
  BrokerPosition,
  BrokerProvider,
  BrokerTransaction,
  OrderResult,
} from "./types";

const DAY = 86_400_000;

/**
 * Fictional fills for the demo account. Prices are round placeholders, not
 * market data; every row this provider returns is dataMode "demo".
 * `ref` ties a fill to the demo memory that explains it.
 */
export const DEMO_FILLS = [
  { id: "demo-fill-1", ref: "tr-nvda", daysAgo: 110, symbol: "NVDA", name: "NVDA", assetClass: "equity", side: "buy", quantity: "30", price: "100" },
  { id: "demo-fill-2", ref: "tr-amd", daysAgo: 92, symbol: "AMD", name: "AMD", assetClass: "equity", side: "buy", quantity: "20", price: "120" },
  { id: "demo-fill-3", ref: "tr-eth", daysAgo: 70, symbol: "ETH", name: "Ether", assetClass: "crypto", side: "buy", quantity: "0.2", price: "2500" },
  { id: "demo-fill-4", ref: "tr-btc", daysAgo: 60, symbol: "BTC", name: "Bitcoin", assetClass: "crypto", side: "buy", quantity: "0.01", price: "60000" },
  { id: "demo-fill-5", ref: "tr-btc-trim", daysAgo: 6, symbol: "BTC", name: "Bitcoin", assetClass: "crypto", side: "sell", quantity: "0.004", price: "70000" },
] as const;

/** Average-cost positions from a list of fills, oldest first. */
export function positionsFromFills(fills: BrokerTransaction[]): BrokerPosition[] {
  const book = new Map<string, BrokerPosition & { cost: number; qty: number }>();
  for (const f of [...fills].sort((a, b) => a.executedAt.getTime() - b.executedAt.getTime())) {
    if (f.side !== "buy" && f.side !== "sell") continue;
    const p = book.get(f.symbol) ?? { symbol: f.symbol, name: f.name, assetClass: f.assetClass, currency: f.currency, quantity: "0", averageCost: null, cost: 0, qty: 0 };
    const q = Number(f.quantity);
    if (f.side === "buy") {
      p.cost += q * Number(f.price ?? 0);
      p.qty += q;
    } else if (p.qty > 0) {
      p.cost -= (p.cost / p.qty) * q;
      p.qty -= q;
    }
    book.set(f.symbol, p);
  }
  return [...book.values()]
    .filter((p) => p.qty > 1e-12)
    .map(({ cost, qty, ...p }) => ({ ...p, quantity: String(Number(qty.toFixed(8))), averageCost: (cost / qty).toFixed(2) }));
}

/**
 * Deterministic fictional brokerage account. The default provider
 * (BROKER_PROVIDER=mock). With an `ApprovalSigner` it also takes paper
 * orders: approved demo orders "fill" at the price on the approved ticket.
 */
export class MockBrokerProvider implements BrokerProvider {
  readonly name = "mock" as const;
  readonly dataMode = "demo" as const;
  private readonly now: number;
  private readonly signer?: ApprovalSigner;

  constructor(opts: { now?: Date; signer?: ApprovalSigner } = {}) {
    this.now = (opts.now ?? new Date()).getTime();
    this.signer = opts.signer;
  }

  capabilities(): BrokerCapabilities {
    return { positions: true, transactions: true, quotes: false, orders: !!this.signer };
  }

  async submitOrder(action: ApprovedAction): Promise<OrderResult> {
    if (!this.signer) throw new Error("Paper orders are not enabled on this mock brokerage");
    this.signer.verify(action, { provider: this.name, dataMode: this.dataMode });
    if (!action.price) {
      return { status: "rejected", externalId: `paper-${action.actionId}`, filledQuantity: null, averagePrice: null, executedAt: new Date(), note: "A paper order needs a price; JARVIS does not invent one." };
    }
    return {
      status: "filled",
      externalId: `paper-${action.actionId}`,
      filledQuantity: action.quantity,
      averagePrice: action.price,
      executedAt: new Date(),
      note: "Paper fill in the demo brokerage at the price on the approved ticket. No real order was placed.",
    };
  }

  async getAccounts(): Promise<BrokerAccount[]> {
    return [{ id: "demo-account", name: "Demo brokerage (illustrative)", currency: "USD" }];
  }

  async getTransactions(accountId: string, since?: Date): Promise<BrokerTransaction[]> {
    this.assertAccount(accountId);
    return DEMO_FILLS.map((f) => ({
      id: f.id,
      symbol: f.symbol,
      name: f.name,
      assetClass: f.assetClass,
      side: f.side,
      quantity: f.quantity,
      price: f.price,
      fees: null,
      currency: "USD",
      executedAt: new Date(this.now - f.daysAgo * DAY),
    })).filter((t) => !since || t.executedAt >= since);
  }

  async getPositions(accountId: string): Promise<BrokerPosition[]> {
    return positionsFromFills(await this.getTransactions(accountId));
  }

  async getBalances(accountId: string): Promise<BrokerBalance[]> {
    this.assertAccount(accountId);
    // No cash figure is invented; the demo account reports none.
    return [];
  }

  private assertAccount(accountId: string) {
    if (accountId !== "demo-account") throw new Error(`Unknown demo account: ${accountId}`);
  }
}
