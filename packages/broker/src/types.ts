import type { ApprovedAction } from "./approval";

/**
 * The contract every brokerage integration implements. Orders go through
 * `submitOrder`, which accepts only an `ApprovedAction` signed after the user
 * confirmed it. See docs/interfaces.md and docs/robinhood.md.
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

export type OrderResult = {
  status: "filled" | "accepted" | "rejected";
  externalId: string;
  filledQuantity: string | null;
  averagePrice: string | null;
  executedAt: Date;
  /** Shown next to the result, e.g. "Paper fill at your illustrative price". */
  note: string;
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
  submitOrder?(action: ApprovedAction): Promise<OrderResult>;
}
