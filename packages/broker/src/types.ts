/**
 * The contract every brokerage integration implements. Read methods only in
 * Phase 2; order submission arrives with the approval flow in Phase 3.
 * See docs/interfaces.md and docs/robinhood.md.
 */
export type BrokerDataMode = "demo" | "live";

export type BrokerCapabilities = {
  positions: boolean;
  transactions: boolean;
  quotes: boolean;
  /** True only when the provider can submit orders through a documented API. */
  orders: boolean;
};

export type BrokerAccount = {
  id: string;
  name: string;
  currency: string;
};

export type AssetClass = "equity" | "crypto" | "cash";

export type BrokerAsset = {
  symbol: string;
  name: string;
  assetClass: AssetClass;
};

export type BrokerPosition = BrokerAsset & {
  quantity: string;
  averageCost: string | null;
  currency: string;
};

export type BrokerBalance = {
  currency: string;
  cash: string;
  buyingPower: string | null;
};

export type BrokerTransaction = BrokerAsset & {
  id: string;
  side: "buy" | "sell" | "deposit" | "withdrawal" | "dividend";
  quantity: string;
  price: string | null;
  fees: string | null;
  currency: string;
  executedAt: Date;
};

export type Quote = {
  symbol: string;
  price: string;
  currency: string;
  asOf: Date;
  /** Where the number came from, shown next to it in the UI. */
  source: string;
};

export interface BrokerProvider {
  readonly name: "mock" | "robinhood-crypto" | "robinhood-chain";
  readonly dataMode: BrokerDataMode;
  capabilities(): BrokerCapabilities;
  getAccounts(): Promise<BrokerAccount[]>;
  getPositions(accountId: string): Promise<BrokerPosition[]>;
  getBalances(accountId: string): Promise<BrokerBalance[]>;
  getTransactions(accountId: string, since?: Date): Promise<BrokerTransaction[]>;
  getQuote?(symbol: string): Promise<Quote>;
}
