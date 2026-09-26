# JARVIS

**Your financial second brain.** Remember everything. Connect the dots. Act with context.

![JARVIS overview](apps/web/public/screenshots/overview.png)

JARVIS is a persistent intelligence layer around your financial life. It keeps
your notes, theses, research, trades and market events in one memory, turns
them into a living knowledge graph, retrieves the right context before it
reasons, and answers with the sources it used. It is not a chatbot, a tracker
or a trading bot: it never executes an action on its own.

```
CAPTURE → REMEMBER → CONNECT → UNDERSTAND → REASON → INSIGHT → ACTION → REMEMBER
```

## Status

Phases 1, 2 and 3 are implemented: accounts, the memory system with exact,
semantic and hybrid search, entity extraction, the knowledge graph and its
explorer, Ask JARVIS with "Memory used", theses with evidence for and against,
research runs that save cited briefs back into memory, an explainable insight
engine, portfolio exposure by theme, watchlist and timeline, and a fictional
demo workspace synced from a mock brokerage, and the action flow: JARVIS
proposes, you approve by typing the order, and a separate step submits it
(paper fills in the demo). Credentials are encrypted and a read-only Robinhood
Chain wallet can be connected. See [docs/milestones.md](docs/milestones.md).

## Quick start

Requirements: Node.js 22.

```bash
npm install
npm run dev          # http://localhost:3000
```

That is all. With no configuration JARVIS uses:

- an **embedded PostgreSQL** (PGlite with pgvector) stored in `.jarvis-data/`,
- **offline mode** for AI: answers quote your memory instead of reasoning, and
  embeddings come from a local hashing model,
- a **demo workspace**: click "Explore the demo workspace" on the sign-in page.
  Each visitor gets a private copy; its companies, notes and trades are
  fictional and its prices are illustrative, not market data.

### Use a real model

Copy `.env.example` to `.env` at the repo root and set one of:

```bash
ANTHROPIC_API_KEY=...        # Claude (default model claude-opus-5)
OPENAI_API_KEY=...           # plus OPENAI_MODEL; also enables OpenAI embeddings
AI_PROVIDER=local            # Ollama: LOCAL_AI_URL, LOCAL_AI_MODEL, LOCAL_EMBEDDING_MODEL
```

Keys are read on the server only and never reach the browser. Changing the
embedding provider changes the vector space; memories are searched only with
embeddings from the active model.

### Use PostgreSQL in Docker

```bash
npm run db:up                                            # pgvector/pgvector:pg16
echo 'DATABASE_URL=postgres://jarvis:jarvis@localhost:5432/jarvis' >> .env
npm run db:migrate
npm run db:seed                                          # optional: demo@jarvis.local workspace
npm run dev
```

Migrations also run automatically when the app starts.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js app in `apps/web` |
| `npm test` | Vitest: services, search, graph, seed and reasoning on in-memory PGlite |
| `npm run typecheck` | TypeScript for packages and the app |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate a migration from `packages/db/src/schema.ts` |
| `npm run db:migrate` / `db:seed` | Apply migrations / create a demo workspace |
| `npm run db:up` | Start PostgreSQL + pgvector with Docker |

## Repository

```
apps/web            Next.js: landing page, product UI, API routes, auth, reasoning
packages/types      Domain types and Zod schemas
packages/db         Drizzle schema (Postgres + pgvector), client for Postgres or PGlite
packages/ai         AIProvider and EmbeddingProvider: Anthropic, OpenAI, local, offline
packages/memory     Capture, entity extraction, exact/semantic/hybrid search, demo seed
packages/knowledge  Entities, relationships, clusters, neighbourhoods
packages/broker     BrokerProvider, mock brokerage, Robinhood Chain, approvals, secrets
packages/ui         Design system components
infrastructure      Docker compose and SQL migrations
docs                Architecture, database, interfaces, Robinhood, milestones
```

Read [docs/architecture.md](docs/architecture.md) first.

## Principles

- **Memory first.** JARVIS retrieves before it answers and cites what it used.
- **No invented data.** No market prices it cannot source; demo data is labelled
  and stored with `data_mode = demo`, separate from live data.
- **No automatic execution.** Actions are proposals you review and confirm.
- **Official interfaces only.** Robinhood integration uses documented APIs
  ([docs/robinhood.md](docs/robinhood.md)).

JARVIS is not investment advice.
