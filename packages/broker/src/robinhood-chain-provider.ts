import { formatEther, type Address } from "viem";
import { chainFor, explorerAddressUrl, publicClientFor, type Network } from "./robinhood-chain";
import type { BrokerAccount, BrokerBalance, BrokerCapabilities, BrokerPosition, BrokerProvider, BrokerTransaction } from "./types";

type BalanceReader = { getBalance(args: { address: Address }): Promise<bigint> };

/**
 * Read-only view of a public Robinhood Chain wallet through the chain's public
 * JSON-RPC (https://docs.robinhood.com/chain/connecting/). It reads the native
 * ETH balance only; JARVIS never holds keys and never sends transactions.
 * Token balances need contract addresses from the official token list and are
 * not read yet.
 */
export class RobinhoodChainProvider implements BrokerProvider {
  readonly name = "robinhood-chain" as const;
  readonly dataMode = "live" as const;
  private readonly client: BalanceReader;

  constructor(
    private readonly address: Address,
    private readonly network: Network = "mainnet",
    client?: BalanceReader,
  ) {
    this.client = client ?? publicClientFor(network);
  }

  capabilities(): BrokerCapabilities {
    return { positions: true, transactions: false, quotes: false, orders: false };
  }

  async getAccounts(): Promise<BrokerAccount[]> {
    const short = `${this.address.slice(0, 6)}…${this.address.slice(-4)}`;
    return [{ id: `${chainFor(this.network).id}:${this.address}`, name: `Robinhood Chain wallet ${short}`, currency: "ETH" }];
  }

  async getPositions(): Promise<BrokerPosition[]> {
    const wei = await this.client.getBalance({ address: this.address });
    if (wei === 0n) return [];
    // No average cost: the chain does not know what you paid, and JARVIS does not guess.
    return [{ symbol: "ETH", name: "Ether", assetClass: "crypto", quantity: formatEther(wei), averageCost: null, currency: "USD" }];
  }

  async getBalances(): Promise<BrokerBalance[]> {
    return [];
  }

  async getTransactions(): Promise<BrokerTransaction[]> {
    return [];
  }

  explorerUrl() {
    return explorerAddressUrl(this.network, this.address);
  }
}
