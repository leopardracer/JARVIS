# jarvis

**Your financial second brain.** Remember everything. Connect the dots. Act with context.

![The JARVIS overview: the command box and this week's briefing, with the decisions waiting for you](apps/web/public/screenshots/overview.png)

JARVIS is an open-source memory for your financial life. It keeps your notes, theses, research, trades
and market events in one place and links them into a knowledge graph. It retrieves the right context before
it reasons, and it tells you what changed, what that touches in your portfolio and why, citing the memories
it used.

It is not a chatbot, a price tracker or a trading bot. It never fetches or invents market data, and it
never executes anything on its own.

```
CAPTURE → REMEMBER → CONNECT → UNDERSTAND → REASON → INSIGHT → ACTION → REMEMBER
```

## What it does

| | |
| --- | --- |
| **Memory** | Notes, ideas, theses, trades, research, goals and market events. You can search them by exact words, by meaning (pgvector), by entity or by date. |
| **Knowledge graph** | Companies, assets, people, themes and events are linked automatically. JARVIS also infers links you never made: *look-alikes* (shared neighbours and shared memories) and *impact paths*, such as "OpenAI depends on NVIDIA, which issues NVDA". |
| **Ask** | Answers retrieve first and cite each memory and entity they used. Works with Anthropic, OpenAI or a local model, or offline with none. |
| **Theses and research** | Evidence for and against each thesis, and a history of conviction changes. Research runs save a cited brief back into memory. |
| **Agents** | A question asked of your memory every day or week. An agent saves a brief only when something it relies on is new. |
| **Insights** | Rules you can read: concentration, exposure change, goal breaches, weakening theses, contradictions, new connections, attention, second-order exposure and look-alike holdings. |
| **Briefing** | Daily and weekly: decisions waiting, what changed, agent findings and new links. Items are ordered by what you hold and what you write about. |
| **Portfolio** | Positions, transactions and exposure by theme (from the graph, on cost basis). Every trade keeps the note that explains it. |
| **Actions** | JARVIS proposes; you approve by typing the order (`SELL 8.27 NVDA`); you submit in a separate step. Approved tickets are signed, and every step is audited. |

<table>
<tr>
<td><img src="apps/web/public/screenshots/briefing.png" alt="Weekly briefing" /></td>
<td><img src="apps/web/public/screenshots/graph.png" alt="Knowledge graph with impact paths" /></td>
</tr>
<tr>
<td><img src="apps/web/public/screenshots/ask.png" alt="Ask with memory used" /></td>
<td><img src="apps/web/public/screenshots/actions.png" alt="Reviewing a proposed order" /></td>
</tr>
</table>

## Quick start

Requirements: Node.js 22.

```bash
git clone https://github.com/leopardracer/JARVIS.git && cd JARVIS
npm install
npm run dev          # http://localhost:3000
```

With nothing configured, JARVIS uses:

- **An embedded PostgreSQL** (PGlite with pgvector), stored in `.jarvis-data/`.
- **Offline mode** for AI. Answers quote your memory instead of reasoning, and embeddings come from a local hashing model.
- **A demo workspace.** Click "Explore the demo workspace" on the sign-in page. Each visitor gets a private copy. Its companies, notes and trades are fictional, and its prices are illustrative, not market data.

### Use a real model

Copy `.env.example` to `.env` at the repo root and set one of:

```bash
ANTHROPIC_API_KEY=...        # Claude (default model claude-opus-5)
OPENAI_API_KEY=...           # plus OPENAI_MODEL; also enables OpenAI embeddings
AI_PROVIDER=local            # Ollama: LOCAL_AI_URL, LOCAL_AI_MODEL, LOCAL_EMBEDDING_MODEL
```

Keys are read on the server only and never reach the browser. Changing the embedding provider changes
the vector space, so memories are searched only with embeddings from the active model.

### Use PostgreSQL in Docker

```bash
npm run db:up                                            # pgvector/pgvector:pg16
echo 'DATABASE_URL=postgres://jarvis:jarvis@localhost:5432/jarvis' >> .env
npm run db:migrate
npm run db:seed                                          # optional: demo@jarvis.local workspace
npm run dev
```

Migrations also run automatically when the app starts.

### Deploy

| Variable | Why |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 16 with pgvector |
| `JARVIS_ENCRYPTION_KEY` | Required in production. `openssl rand -base64 32`. It encrypts broker credentials and signs approved orders. |
| `CRON_SECRET` | Optional. Enables `POST /api/scheduler/run`, so agents also run for accounts nobody opens. |
| `JARVIS_DISABLE_DEMO=1` | Hides the one-click demo on a public instance |

Agents run whenever someone opens JARVIS after an agent's turn has passed. With `CRON_SECRET` set, any
scheduler can run them too:

```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/scheduler/run
```

## Robinhood

JARVIS only uses interfaces Robinhood documents publicly ([docs/robinhood.md](docs/robinhood.md)).

| Interface | Status |
| --- | --- |
| Robinhood Chain | Read-only wallet balance over the public RPC. JARVIS never asks for a private key. |
| Crypto Trading API | Planned. It will be implemented from the official reference only. |
| Demo brokerage | Fictional account with paper fills, so you can try the whole action flow safely. |

## Security

- Broker credentials are sealed with AES-256-GCM and decrypted only on the server. API responses never include them.
- Approval requires typing the exact order. Submission is a separate request. The ticket is HMAC-signed and refused if anything changed after approval or if the approval is more than 15 minutes old.
- Every sign-in, proposal, approval, submission, agent change and connection change is written to an audit log, which you can view in Settings.
- Every financial row carries `data_mode` (`demo` or `live`). Demo accounts cannot connect live accounts.

## Repository

```
apps/web            Next.js: landing page, product UI, API routes, auth, reasoning, agents, briefings
packages/types      Domain types and Zod schemas
packages/db         Drizzle schema (Postgres + pgvector), client for Postgres or PGlite
packages/ai         AIProvider and EmbeddingProvider: Anthropic, OpenAI, local, offline
packages/memory     Capture, entity extraction, exact/semantic/hybrid search, demo seed
packages/knowledge  Graph, clusters, exposure by theme, insight engine, graph inference
packages/broker     BrokerProvider, demo brokerage, Robinhood Chain, approvals, secrets
packages/ui         Design system components
infrastructure      Docker compose and SQL migrations
docs                Architecture, database, interfaces, Robinhood, milestones
```

Start with [docs/architecture.md](docs/architecture.md). [docs/milestones.md](docs/milestones.md) lists
what each phase delivered.

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js app in `apps/web` |
| `npm test` | Vitest on in-memory PGlite: memory, search, graph, inference, insights, actions, agents, briefings |
| `npm run typecheck` / `lint` | TypeScript and ESLint |
| `npm run db:generate` | Generate a migration from `packages/db/src/schema.ts` |
| `npm run db:migrate` / `db:seed` | Apply migrations / create a demo workspace |
| `npm run db:up` | Start PostgreSQL + pgvector with Docker |

## Principles

- **Memory first.** JARVIS retrieves before it answers and cites what it used.
- **No invented data.** It never shows a market price it cannot source. Demo data is labelled and kept apart from live data.
- **Explainable.** Insights, inferences and briefings come from rules you can read. A language model only phrases what they found.
- **No automatic execution.** Actions are proposals you review, confirm and submit yourself.
- **Official interfaces only.** No reverse-engineered or undocumented endpoints.

JARVIS is not investment advice.
