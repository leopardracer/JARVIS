# Milestones

## Phase 1: foundation (done)

- [x] Architecture, schema, interfaces and milestones (`docs/`)
- [x] Monorepo: `apps/web` + `packages/*`, shared TypeScript config, Vitest, CI
- [x] Database: Drizzle schema for every table, migrations, Postgres (Docker) or embedded PGlite
- [x] Authentication: sign up, sign in, sign out, demo account, protected routes
- [x] Memory: create, edit, delete, list with filters, chronological view
- [x] Search: exact, semantic, hybrid and related memories
- [x] Entity extraction and linking on capture
- [x] AI provider abstraction: Anthropic, OpenAI, local (Ollama), mock
- [x] Ask JARVIS: retrieval, streamed answer, "Memory used" panel, conversation history
- [x] Knowledge graph UI: zoom, pan, search, type filters, clusters, focus mode, timeline mode, details sidebar with AI summary
- [x] App shell with the full navigation (Portfolio, Research, Insights, Watchlist and Activity read the seeded data; empty states otherwise)
- [x] Demo seed: NVIDIA, AMD, Microsoft, OpenAI; NVDA, AMD, ETH, BTC; AI infrastructure, semiconductors, data centers, crypto
- [x] Landing page in the brand system
- [x] Tests for services and API validation; README and local development guide

## Phase 2: financial context and insights (done)

- [x] `BrokerProvider` contract and `MockBrokerProvider` (fictional, `dataMode: "demo"`, no order capability)
- [x] Idempotent broker sync into portfolios, positions and transactions; the demo workspace is synced from the mock brokerage
- [x] Portfolio: positions with linked theses, exposure by theme from the knowledge graph, transactions with the memory behind each trade
- [x] Theses: create, change stance and conviction (each change saved to memory with its reason), close, link evidence for and against
- [x] Research runs: retrieve from memory, cited brief (or an extractive brief offline), saved back into memory as a research note
- [x] Insight engine with explainable evidence: concentration, exposure change, goal caps, thesis change, contradictions, new connections, mention frequency; deduplicated by fingerprint
- [x] Insights page: filters, seen and dismiss, re-run on demand and after thesis, research and sync changes
- [x] Watchlist: add by ticker, notes, mentions, holdings and theses per asset
- [x] Activity timeline grouped by day with filters

## Phase 3: broker and actions

`BrokerProvider` implementations for the documented Robinhood interfaces,
encrypted credential storage, action proposals from the reasoning layer,
review and confirmation flow, audit log UI.

## Phase 4: intelligence

Scheduled research agents, deeper graph inference (similarity, causal chains),
personalised briefings.
