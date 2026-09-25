# Database schema

PostgreSQL 16 + pgvector. Defined in `packages/db/src/schema.ts` (Drizzle),
migrations in `infrastructure/migrations`. All user-owned rows carry `user_id`
and every query in the services is scoped by it.

## Identity

| Table | Purpose | Key columns |
| --- | --- | --- |
| `users` | Accounts | `id`, `email` (unique), `password_hash` (scrypt), `display_name`, `mode` (`demo`/`live`) |
| `sessions` | Server-side sessions | `id`, `user_id`, `token_hash` (SHA-256 of the cookie token, unique), `expires_at` |
| `audit_logs` | Append-only log of sensitive operations | `user_id`, `event`, `target_type`, `target_id`, `metadata` jsonb, `ip` |

## Memory

| Table | Purpose | Key columns |
| --- | --- | --- |
| `memories` | Everything the user captures | `id`, `user_id`, `type` (note, idea, thesis, trade, portfolio_context, research, document, link, watchlist, goal, person, company, protocol, market_event), `title`, `content`, `source`, `source_url`, `tags` text[], `occurred_at`, `created_at`, `updated_at`, `search` tsvector (generated) |
| `embeddings` | One vector per memory and model | `memory_id`, `model`, `dimensions`, `vector` vector(1536) |
| `memory_entities` | memory ↔ entity | `memory_id`, `entity_id`, `role` (mention, subject), `confidence` |

Indexes: `memories(user_id, created_at desc)`, `memories(user_id, type)`, GIN on
`search`, GIN on `tags`, HNSW (cosine) on `embeddings.vector`, unique
`(memory_id, model)`.

Vectors are stored at 1536 dimensions. Smaller embedding models are
zero-padded, which leaves cosine similarity unchanged; searches only compare
vectors from the same `model`.

## Knowledge graph

| Table | Purpose | Key columns |
| --- | --- | --- |
| `entities` | Graph nodes | `id`, `user_id`, `type` (asset, company, person, protocol, trade, idea, thesis, document, event, research, portfolio, wallet, theme), `name`, `slug` (unique per user+type), `symbol`, `description`, `metadata` jsonb |
| `relationships` | entity ↔ entity edges | `source_id`, `target_id`, `type` (related_to, supports, contradicts, caused_by, depends_on, invested_in, mentioned_in, derived_from, similar_to, involved_in), `weight`, `memory_id` (provenance), `created_at` |

Unique `(user_id, source_id, target_id, type)`; repeated evidence increases
`weight` instead of duplicating edges.

## Financial context

| Table | Purpose | Key columns |
| --- | --- | --- |
| `portfolios` | A brokerage account, wallet or manual portfolio | `name`, `provider` (mock, robinhood, manual), `data_mode`, `external_id` |
| `positions` | Holdings (asset ↔ portfolio) | `portfolio_id`, `asset_entity_id`, `quantity` numeric, `average_cost` numeric, `currency`, `as_of` |
| `transactions` | Trades and transfers (asset ↔ transaction) | `portfolio_id`, `asset_entity_id`, `side`, `quantity`, `price`, `fees`, `executed_at`, `data_mode`, `memory_id` |
| `theses` | Investment theses | `title`, `statement`, `stance` (bullish, bearish, neutral), `status` (active, closed), `conviction` 1–5 |
| `thesis_memories` | memory ↔ thesis | `thesis_id`, `memory_id`, `relation` (origin, supports, contradicts) |
| `thesis_assets` | thesis ↔ asset | `thesis_id`, `asset_entity_id` |
| `research` | Research runs and their results | `query`, `summary`, `sources` jsonb, `status` |
| `watchlists`, `watchlist_items` | Watched assets | `watchlist_id`, `asset_entity_id`, `note` |

Monetary values use `numeric(24, 8)`; never floats.

## Intelligence and actions

| Table | Purpose | Key columns |
| --- | --- | --- |
| `insights` | Explainable detected changes | `kind`, `title`, `what_changed`, `why_it_matters`, `evidence` jsonb, `memory_ids` uuid[], `entity_ids` uuid[], `status` (new, seen, dismissed) |
| `activities` | Timeline of everything that happened | `kind` (memory_created, question_asked, entity_linked, ...), `subject_type`, `subject_id`, `summary` |
| `conversations`, `messages` | Question history | `messages.role`, `content`, `sources` jsonb |
| `actions` | Proposed account-changing operations | `type` (buy, sell, ...), `asset_entity_id`, `quantity`, `estimated_price`, `reasoning`, `context` jsonb, `data_mode`, `approval_status` (proposed, approved, rejected, expired), `execution_status` (not_started, executing, executed, failed), `proposed_by` |
| `action_approvals` | Who approved or rejected, and when | `action_id`, `user_id`, `decision`, `confirmation_hash`, `decided_at` |
| `broker_connections` | Encrypted broker credentials | `provider`, `encrypted_credentials` (AES-256-GCM), `data_mode`, `status` |
