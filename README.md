# JARVIS

<img width="1629" height="965" alt="image" src="https://github.com/user-attachments/assets/62d1afd7-3f78-4adf-b835-1e0c6a9afc9f" />

JARVIS is an AI "second brain" that remembers your notes and explains your
portfolio on [Robinhood Chain](https://docs.robinhood.com/chain/). It is
read-only with money: no private keys, no trades.

## What is here

| Path | What it does |
| --- | --- |
| `src/app/page.tsx` | Landing page |
| `src/app/chat` + `src/app/api/chat` | Chat with JARVIS, streamed from the Claude API |
| `src/app/wallet` + `src/app/api/wallet/[address]` | Read-only ETH balance lookup on Robinhood Chain mainnet (4663) or testnet (46630) |
| `src/lib/chain.ts` | Robinhood Chain definitions for viem and RPC helpers |
| `db/schema.sql` | Target Postgres + pgvector schema with row-level security (not wired up yet) |

## Run locally

Requires Node.js 22+.

```bash
cp .env.example .env.local   # add ANTHROPIC_API_KEY
npm install
npm run dev
```

Open http://localhost:3000.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Roadmap

1. Skeleton: web app, chat, chain reads (this)
2. Memory: accounts, notes, file upload, search with citations
3. Wallets: Sign-In with Ethereum, token balances, Chainlink prices, transaction history
4. Theses and price alerts
5. Public beta
