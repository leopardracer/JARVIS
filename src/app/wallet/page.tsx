"use client";

import { useState } from "react";
import type { NativeBalance, Network } from "@/lib/chain";

export default function WalletPage() {
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState<Network>("mainnet");
  const [result, setResult] = useState<NativeBalance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `/api/wallet/${encodeURIComponent(address.trim())}?network=${network}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold">Wallet</h1>
        <p className="text-muted">
          Read-only lookup on Robinhood Chain. JARVIS never asks for keys.
        </p>
      </div>

      <form onSubmit={lookup} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x…"
          className="flex-1 rounded-none border border-hairline bg-background px-4 py-2.5 font-mono text-sm outline-none focus:border-brand"
        />
        <select
          value={network}
          onChange={(e) => setNetwork(e.target.value as Network)}
          className="rounded-none border border-hairline bg-background px-4 py-2.5"
        >
          <option value="mainnet">Mainnet</option>
          <option value="testnet">Testnet</option>
        </select>
        <button
          type="submit"
          disabled={pending || !address.trim()}
          className="rounded-none bg-brand px-5 py-2.5 font-semibold text-brand-foreground disabled:opacity-50"
        >
          {pending ? "Checking…" : "Check"}
        </button>
      </form>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {result && (
        <div className="rounded-none border border-hairline bg-surface p-6">
          <p className="text-sm text-muted">ETH balance</p>
          <p className="text-3xl font-bold">{result.eth} ETH</p>
          <p className="mt-2 text-sm text-muted">
            Block {result.blockNumber} · chain {result.chainId} ·{" "}
            <a
              href={result.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-brand underline"
            >
              explorer
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
