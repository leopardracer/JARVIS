# Core interfaces

Types live in `packages/types`; implementations in the named packages.

## AI (`packages/ai`)

```ts
interface AIProvider {
  readonly name: "anthropic" | "openai" | "local" | "mock";
  readonly model: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  stream(req: CompletionRequest): AsyncIterable<CompletionChunk>;
  extract<T>(req: ExtractRequest<T>): Promise<T>; // structured output validated with Zod
}

interface EmbeddingProvider {
  readonly name: "openai" | "local" | "hash";
  readonly model: string;
  readonly dimensions: number; // <= 1536
  embed(texts: string[]): Promise<number[][]>;
}

createAIProvider(env): AIProvider          // AI_PROVIDER=anthropic|openai|local|mock
createEmbeddingProvider(env): EmbeddingProvider // EMBEDDING_PROVIDER=openai|local|hash
```

- `AnthropicProvider`: official `@anthropic-ai/sdk`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (default `claude-opus-5`).
- `OpenAIProvider`: official `openai` SDK, `OPENAI_API_KEY`, `OPENAI_MODEL` (required).
- `LocalProvider`: an Ollama server (`LOCAL_AI_URL`, `LOCAL_AI_MODEL`) through its documented `/api/chat` endpoint.
- `MockProvider`: no network. Answers extractively from the retrieved context so the product works offline; the UI labels it.
- `HashEmbeddingProvider`: deterministic feature-hashing embeddings (no network). Weaker than a real model but keeps semantic search functional in development.

## Memory (`packages/memory`)

```ts
interface MemoryService {
  create(userId, input: CreateMemoryInput): Promise<MemoryWithEntities>;
  update(userId, id, patch): Promise<MemoryWithEntities>;
  remove(userId, id): Promise<void>;
  get(userId, id): Promise<MemoryWithEntities | null>;
  list(userId, filter: MemoryFilter): Promise<Page<Memory>>;      // chronological, filters
  search(userId, query: SearchQuery): Promise<SearchHit[]>;        // mode: exact | semantic | hybrid
  related(userId, id, limit): Promise<SearchHit[]>;                // vector + shared entities
}
```

`MemoryFilter`: `types`, `tags`, `entityIds`, `from`, `to`, `cursor`, `limit`.

## Knowledge (`packages/knowledge`)

```ts
interface KnowledgeService {
  upsertEntity(userId, input): Promise<Entity>;
  link(userId, sourceId, targetId, type, memoryId?): Promise<Relationship>;
  graph(userId, filter: GraphFilter): Promise<GraphData>;          // nodes, edges, clusters
  neighborhood(userId, entityId, depth): Promise<GraphData>;       // focus mode
  entityDetails(userId, entityId): Promise<EntityDetails>;         // memories, assets, events, trades
  resolve(userId, text): Promise<Entity[]>;                        // mentions in free text
}
```

## Reasoning (`apps/web/src/server/reasoning`)

```ts
retrieveContext(userId, question): Promise<RetrievedContext>; // memories + entities, with ids
answer(userId, question, conversationId?): AsyncIterable<AskEvent>;
// AskEvent = { type: "sources", sources } | { type: "text", text } | { type: "done", messageId } | { type: "error", message }
```

## Broker (`packages/broker`)

```ts
interface BrokerProvider {
  readonly name: "mock" | "robinhood-crypto" | "robinhood-chain";
  readonly dataMode: "demo" | "live";
  capabilities(): BrokerCapabilities;
  getAccounts(): Promise<BrokerAccount[]>;
  getPositions(accountId): Promise<BrokerPosition[]>;
  getBalances(accountId): Promise<BrokerBalance[]>;
  getTransactions(accountId, since?): Promise<BrokerTransaction[]>;
  getQuote?(symbol): Promise<Quote>;
  submitOrder?(action: ApprovedAction): Promise<OrderResult>;
}
```

`MockBrokerProvider` (Phase 2) returns a fictional account; `syncBrokerAccounts({ db, userId, provider, resolveAsset })`
imports it idempotently (transactions keyed by the provider's id, positions replaced with the provider's view).

## Insights (`packages/knowledge`)

```ts
exposure(db, userId, at?): Promise<Exposure>      // holdings replayed from trades, share of cost basis per graph theme
class InsightEngine {
  detect(userId, now?): Promise<InsightDraft[]>;    // pure read
  run(userId, now?): Promise<InsightRun>;           // stores new drafts, skips known fingerprints, logs activity
}
// InsightDraft = { kind, title, whatChanged, whyItMatters, evidence: { label, memoryId? }[], memoryIds, entityIds, fingerprint }
```

Detectors are rules over the user's own data, so every insight is reproducible
and cites the memories behind it. None of them uses market prices.

| Kind | Fires when |
| --- | --- |
| `concentration` | One theme carries at least half of cost basis across two or more assets |
| `exposure_change` | A theme's share moved 3 points or more in 30 days because of trades |
| `goal` | A goal memory with a cap ("under 15%") is breached, close to it, or back inside it |
| `thesis_change` | An active thesis has at least as much recent evidence against it as for it |
| `contradiction` | A memory argues against another node, a trade goes against an active thesis, or two theses take opposite sides |
| `new_connection` | A memory in the last 14 days links two entities never linked before |
| `mention_frequency` | An entity appears in 3+ memories in 14 days, at least twice its usual rate |

## Research (`apps/web/src/server/research`)

```ts
runResearch(deps, userId, query): Promise<ResearchRow> // RETRIEVE → REASON → REMEMBER; saves a research memory
```

## Auth (`apps/web/src/server/auth`)

```ts
interface AuthProvider {
  signUp(email, password, displayName?): Promise<User>;
  signIn(email, password): Promise<User>;
}
createSession(userId) / getSessionUser() / destroySession()
```

Phase 1 ships email and password (scrypt) with database sessions in an
`httpOnly`, `SameSite=Lax`, `Secure` (in production) cookie, plus a one-click
demo account. The provider interface allows adding OAuth later.
