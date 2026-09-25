import {
  createPublicClient,
  defineChain,
  formatEther,
  http,
  isAddress,
  type Address,
} from "viem";

// https://docs.robinhood.com/chain/connecting/
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
});

export const robinhoodChainTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: {
      name: "Explorer",
      url: "https://explorer.testnet.chain.robinhood.com",
    },
  },
  testnet: true,
});

export type Network = "mainnet" | "testnet";

export function chainFor(network: Network) {
  return network === "mainnet" ? robinhoodChain : robinhoodChainTestnet;
}

// The public RPC endpoints are rate-limited; set ROBINHOOD_RPC_URL_* to an
// Alchemy/Chainstack/QuickNode endpoint in production.
export function rpcUrlFor(network: Network): string {
  const override =
    network === "mainnet"
      ? process.env.ROBINHOOD_RPC_URL_MAINNET
      : process.env.ROBINHOOD_RPC_URL_TESTNET;
  return override || chainFor(network).rpcUrls.default.http[0];
}

export function publicClientFor(network: Network) {
  return createPublicClient({
    chain: chainFor(network),
    transport: http(rpcUrlFor(network)),
  });
}

export function parseAddress(value: string): Address | null {
  return isAddress(value) ? value : null;
}

export function explorerAddressUrl(network: Network, address: Address) {
  return `${chainFor(network).blockExplorers.default.url}/address/${address}`;
}

export type NativeBalance = {
  network: Network;
  chainId: number;
  address: Address;
  wei: string;
  eth: string;
  blockNumber: string;
  explorerUrl: string;
};

// Read-only: JARVIS never holds keys or sends transactions.
export async function getNativeBalance(
  network: Network,
  address: Address,
): Promise<NativeBalance> {
  const client = publicClientFor(network);
  const [wei, blockNumber] = await Promise.all([
    client.getBalance({ address }),
    client.getBlockNumber(),
  ]);
  return {
    network,
    chainId: chainFor(network).id,
    address,
    wei: wei.toString(),
    eth: formatEther(wei),
    blockNumber: blockNumber.toString(),
    explorerUrl: explorerAddressUrl(network, address),
  };
}
