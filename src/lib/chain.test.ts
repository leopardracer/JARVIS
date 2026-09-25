import { afterEach, describe, expect, it, vi } from "vitest";
import { chainFor, explorerAddressUrl, parseAddress, rpcUrlFor } from "./chain";

const ADDRESS = "0x0000000000000000000000000000000000000001";

describe("chain config", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the documented chain IDs", () => {
    expect(chainFor("mainnet").id).toBe(4663);
    expect(chainFor("testnet").id).toBe(46630);
  });

  it("falls back to the public RPC when no override is set", () => {
    vi.stubEnv("ROBINHOOD_RPC_URL_MAINNET", "");
    expect(rpcUrlFor("mainnet")).toBe(
      "https://rpc.mainnet.chain.robinhood.com",
    );
  });

  it("prefers the RPC override from the environment", () => {
    vi.stubEnv("ROBINHOOD_RPC_URL_TESTNET", "https://example.com/rpc");
    expect(rpcUrlFor("testnet")).toBe("https://example.com/rpc");
  });

  it("builds explorer links", () => {
    expect(explorerAddressUrl("mainnet", ADDRESS)).toBe(
      `https://robinhoodchain.blockscout.com/address/${ADDRESS}`,
    );
  });
});

describe("parseAddress", () => {
  it("accepts a valid address", () => {
    expect(parseAddress(ADDRESS)).toBe(ADDRESS);
  });

  it("rejects garbage", () => {
    expect(parseAddress("0x123")).toBeNull();
    expect(parseAddress("vitalik.eth")).toBeNull();
  });
});
