# Milestones

## Phase 1: foundation (this PR)

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

## Phase 2: financial context and insights

Portfolio, holdings and transactions views (demo data from `MockBrokerProvider`),
watchlist, research runs, insight engine (thesis change, contradictions, new
connections, mention frequency, exposure change) with explainable evidence,
activity timeline.

## Phase 3: broker and actions

`BrokerProvider` implementations for the documented Robinhood interfaces,
encrypted credential storage, action proposals from the reasoning layer,
review and confirmation flow, audit log UI.

## Phase 4: intelligence

Scheduled research agents, deeper graph inference (similarity, causal chains),
personalised briefings.
