import { sql, type SQL } from "drizzle-orm";
import {
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import {
  DATA_MODES,
  ENTITY_TYPES,
  MEMORY_TYPES,
  RELATIONSHIP_TYPES,
} from "@jarvis/types";

export const VECTOR_DIMENSIONS = 1536;

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const money = (name: string) => numeric(name, { precision: 24, scale: 8 });

export const memoryType = pgEnum("memory_type", MEMORY_TYPES);
export const entityType = pgEnum("entity_type", ENTITY_TYPES);
export const relationshipType = pgEnum("relationship_type", RELATIONSHIP_TYPES);
export const dataMode = pgEnum("data_mode", DATA_MODES);

// ---------- Identity ----------

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  displayName: text("display_name"),
  mode: dataMode("mode").notNull().default("demo"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    event: text("event").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_user_idx").on(t.userId, t.createdAt)],
);

// ---------- Memory ----------

export const memories = pgTable(
  "memories",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: memoryType("type").notNull().default("note"),
    title: text("title").notNull(),
    content: text("content").notNull(),
    source: text("source").notNull().default("manual"),
    sourceUrl: text("source_url"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    search: tsvector("search").generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('english', coalesce(${memories.title}, '')), 'A') || setweight(to_tsvector('english', coalesce(${memories.content}, '')), 'B')`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("memories_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("memories_user_type_idx").on(t.userId, t.type),
    index("memories_search_idx").using("gin", t.search),
    index("memories_tags_idx").using("gin", t.tags),
  ],
);

export const embeddings = pgTable(
  "embeddings",
  {
    id: id(),
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    dimensions: integer("dimensions").notNull(),
    vector: vector("vector", { dimensions: VECTOR_DIMENSIONS }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("embeddings_memory_model_idx").on(t.memoryId, t.model),
    index("embeddings_user_model_idx").on(t.userId, t.model),
    index("embeddings_vector_idx").using("hnsw", t.vector.op("vector_cosine_ops")),
  ],
);

// ---------- Knowledge graph ----------

export const entities = pgTable(
  "entities",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: entityType("type").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    symbol: text("symbol"),
    description: text("description"),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("entities_user_type_slug_idx").on(t.userId, t.type, t.slug),
    index("entities_user_symbol_idx").on(t.userId, t.symbol),
  ],
);

export const memoryEntities = pgTable(
  "memory_entities",
  {
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("mention"),
    confidence: real("confidence").notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.memoryId, t.entityId] }),
    index("memory_entities_entity_idx").on(t.entityId),
  ],
);

export const relationships = pgTable(
  "relationships",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    type: relationshipType("type").notNull(),
    weight: real("weight").notNull().default(1),
    memoryId: uuid("memory_id").references(() => memories.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("relationships_unique_idx").on(t.userId, t.sourceId, t.targetId, t.type),
    index("relationships_source_idx").on(t.sourceId),
    index("relationships_target_idx").on(t.targetId),
  ],
);

// ---------- Financial context ----------

export const portfolios = pgTable(
  "portfolios",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    provider: text("provider").notNull().default("manual"),
    externalId: text("external_id"),
    dataMode: dataMode("data_mode").notNull(),
    entityId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("portfolios_user_idx").on(t.userId)],
);

export const positions = pgTable(
  "positions",
  {
    id: id(),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    assetEntityId: uuid("asset_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    quantity: money("quantity").notNull(),
    averageCost: money("average_cost"),
    currency: text("currency").notNull().default("USD"),
    asOf: timestamp("as_of", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("positions_portfolio_asset_idx").on(t.portfolioId, t.assetEntityId)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    portfolioId: uuid("portfolio_id")
      .notNull()
      .references(() => portfolios.id, { onDelete: "cascade" }),
    assetEntityId: uuid("asset_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    side: text("side").notNull(), // buy | sell | deposit | withdrawal | dividend
    quantity: money("quantity").notNull(),
    price: money("price"),
    fees: money("fees"),
    currency: text("currency").notNull().default("USD"),
    executedAt: timestamp("executed_at", { withTimezone: true }).notNull(),
    dataMode: dataMode("data_mode").notNull(),
    externalId: text("external_id"),
    memoryId: uuid("memory_id").references(() => memories.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("transactions_user_executed_idx").on(t.userId, t.executedAt.desc()),
    index("transactions_asset_idx").on(t.assetEntityId),
  ],
);

export const theses = pgTable(
  "theses",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    statement: text("statement").notNull(),
    stance: text("stance").notNull().default("bullish"), // bullish | bearish | neutral
    status: text("status").notNull().default("active"), // active | closed
    conviction: integer("conviction").notNull().default(3),
    entityId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("theses_user_idx").on(t.userId, t.status)],
);

export const thesisMemories = pgTable(
  "thesis_memories",
  {
    thesisId: uuid("thesis_id")
      .notNull()
      .references(() => theses.id, { onDelete: "cascade" }),
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    relation: text("relation").notNull().default("supports"), // origin | supports | contradicts
  },
  (t) => [primaryKey({ columns: [t.thesisId, t.memoryId] })],
);

export const thesisAssets = pgTable(
  "thesis_assets",
  {
    thesisId: uuid("thesis_id")
      .notNull()
      .references(() => theses.id, { onDelete: "cascade" }),
    assetEntityId: uuid("asset_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.thesisId, t.assetEntityId] })],
);

export const research = pgTable(
  "research",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    summary: text("summary"),
    sources: jsonb("sources").$type<{ title: string; url?: string }[]>().notNull().default([]),
    status: text("status").notNull().default("pending"), // pending | running | done | failed
    memoryId: uuid("memory_id").references(() => memories.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("research_user_idx").on(t.userId, t.createdAt)],
);

export const watchlists = pgTable("watchlists", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const watchlistItems = pgTable(
  "watchlist_items",
  {
    watchlistId: uuid("watchlist_id")
      .notNull()
      .references(() => watchlists.id, { onDelete: "cascade" }),
    assetEntityId: uuid("asset_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.watchlistId, t.assetEntityId] })],
);

// ---------- Intelligence ----------

export const insights = pgTable(
  "insights",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    whatChanged: text("what_changed").notNull(),
    whyItMatters: text("why_it_matters").notNull(),
    evidence: jsonb("evidence").$type<{ label: string; memoryId?: string }[]>().notNull().default([]),
    memoryIds: uuid("memory_ids").array().notNull().default(sql`'{}'::uuid[]`),
    entityIds: uuid("entity_ids").array().notNull().default(sql`'{}'::uuid[]`),
    status: text("status").notNull().default("new"), // new | seen | dismissed
    createdAt: createdAt(),
  },
  (t) => [index("insights_user_idx").on(t.userId, t.status, t.createdAt)],
);

export const activities = pgTable(
  "activities",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    subjectType: text("subject_type"),
    subjectId: uuid("subject_id"),
    summary: text("summary").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("activities_user_idx").on(t.userId, t.createdAt.desc())],
);

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("conversations_user_idx").on(t.userId, t.updatedAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    sources: jsonb("sources").$type<unknown[]>().notNull().default([]),
    provider: text("provider"),
    model: text("model"),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

// ---------- Actions (Phase 3 flows; schema defined now) ----------

export const actions = pgTable(
  "actions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // buy | sell | ...
    assetEntityId: uuid("asset_entity_id").references(() => entities.id, {
      onDelete: "set null",
    }),
    quantity: money("quantity"),
    estimatedPrice: money("estimated_price"),
    reasoning: text("reasoning").notNull(),
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    dataMode: dataMode("data_mode").notNull(),
    provider: text("provider").notNull(),
    approvalStatus: text("approval_status").notNull().default("proposed"),
    executionStatus: text("execution_status").notNull().default("not_started"),
    proposedBy: text("proposed_by").notNull(), // ai | user
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("actions_user_idx").on(t.userId, t.approvalStatus)],
);

export const actionApprovals = pgTable("action_approvals", {
  id: id(),
  actionId: uuid("action_id")
    .notNull()
    .references(() => actions.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  decision: text("decision").notNull(), // approved | rejected
  confirmationHash: text("confirmation_hash"),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
});

export const brokerConnections = pgTable("broker_connections", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  encryptedCredentials: text("encrypted_credentials").notNull(),
  dataMode: dataMode("data_mode").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
