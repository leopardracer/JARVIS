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
