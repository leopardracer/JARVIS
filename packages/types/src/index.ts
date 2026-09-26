import { z } from "zod";

export const MEMORY_TYPES = [
  "note",
  "idea",
  "thesis",
  "trade",
  "portfolio_context",
  "research",
  "document",
  "link",
  "watchlist",
  "goal",
  "person",
  "company",
  "protocol",
  "market_event",
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export const ENTITY_TYPES = [
  "asset",
  "company",
  "person",
  "protocol",
  "trade",
  "idea",
  "thesis",
  "document",
  "event",
  "research",
  "portfolio",
  "wallet",
  "theme",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const RELATIONSHIP_TYPES = [
  "related_to",
  "supports",
  "contradicts",
  "caused_by",
  "depends_on",
  "invested_in",
  "mentioned_in",
  "derived_from",
  "similar_to",
  "involved_in",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const DATA_MODES = ["demo", "live"] as const;
export type DataMode = (typeof DATA_MODES)[number];

export type User = {
  id: string;
  email: string;
  displayName: string | null;
  mode: DataMode;
  createdAt: Date;
};

export type Memory = {
  id: string;
  userId: string;
  type: MemoryType;
  title: string;
  content: string;
  source: string;
  sourceUrl: string | null;
  tags: string[];
  occurredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Entity = {
  id: string;
  userId: string;
  type: EntityType;
  name: string;
  slug: string;
  symbol: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

export type Relationship = {
  id: string;
  userId: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  weight: number;
  memoryId: string | null;
  createdAt: Date;
};

export type EntityRef = Pick<Entity, "id" | "type" | "name" | "symbol">;

export type MemoryWithEntities = Memory & { entities: EntityRef[] };

export type SearchMode = "exact" | "semantic" | "hybrid";

export type SearchHit = {
  memory: MemoryWithEntities;
  score: number;
  /** Which retrieval signals matched: text rank, vector similarity, shared entities. */
  matchedBy: ("text" | "vector" | "entity")[];
};

export type Page<T> = { items: T[]; nextCursor: string | null };

// ---------- Graph ----------

export type GraphNode = {
  id: string;
  type: EntityType;
  label: string;
  symbol: string | null;
  cluster: string | null;
  degree: number;
  mentions: number;
  firstSeen: string;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  weight: number;
  createdAt: string;
};

export type GraphCluster = { id: string; label: string; size: number };

export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
};

export type EntityDetails = {
  entity: Entity;
  memories: Memory[];
  neighbors: (EntityRef & { relation: RelationshipType; direction: "in" | "out" })[];
  relatedAssets: EntityRef[];
  relatedEvents: EntityRef[];
  relatedTrades: EntityRef[];
};

// ---------- Reasoning ----------

export type ContextSource =
  | {
      kind: "memory";
      ref: string; // "M1"
      id: string;
      title: string;
      type: MemoryType;
      excerpt: string;
      createdAt: string;
      score: number;
    }
  | {
      kind: "entity";
      ref: string; // "E1"
      id: string;
      name: string;
      type: EntityType;
      relations: string[];
    };

export type AskEvent =
  | { type: "sources"; sources: ContextSource[]; provider: string; model: string }
  | { type: "text"; text: string }
  | { type: "done"; conversationId: string; messageId: string }
  | { type: "error"; message: string };

// ---------- Validation schemas (shared by API routes and forms) ----------

const tag = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .transform((t) => t.toLowerCase().replace(/^#/, ""));

export const createMemorySchema = z.object({
  type: z.enum(MEMORY_TYPES).default("note"),
  title: z.string().trim().min(1, "Give it a title").max(200),
  content: z.string().trim().min(1, "Write something to remember").max(50_000),
  source: z.string().trim().max(100).default("manual"),
  sourceUrl: z.url().max(2000).nullish(),
  tags: z.array(tag).max(20).default([]),
  occurredAt: z.coerce.date().nullish(),
});
export type CreateMemoryInput = z.input<typeof createMemorySchema>;

export const updateMemorySchema = createMemorySchema.partial();
export type UpdateMemoryInput = z.input<typeof updateMemorySchema>;

export const memoryFilterSchema = z.object({
  types: z.array(z.enum(MEMORY_TYPES)).optional(),
  tags: z.array(z.string()).optional(),
  entityIds: z.array(z.uuid()).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type MemoryFilter = z.input<typeof memoryFilterSchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(500),
  mode: z.enum(["exact", "semantic", "hybrid"]).default("hybrid"),
  types: z.array(z.enum(MEMORY_TYPES)).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});
export type SearchQuery = z.input<typeof searchQuerySchema>;

export const askSchema = z.object({
  question: z.string().trim().min(1).max(4000),
  conversationId: z.uuid().optional(),
});

export const credentialsSchema = z.object({
  email: z.email().max(254).transform((e) => e.toLowerCase()),
  password: z.string().min(10, "Use at least 10 characters").max(200),
  displayName: z.string().trim().max(80).optional(),
});

export const graphFilterSchema = z.object({
  types: z.array(z.enum(ENTITY_TYPES)).optional(),
  until: z.coerce.date().optional(),
  q: z.string().trim().max(200).optional(),
});
export type GraphFilter = z.input<typeof graphFilterSchema>;

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// ---------- Phase 2: financial context ----------

const symbol = z
  .string()
  .trim()
  .min(1)
  .max(12)
  .regex(/^\$?[A-Za-z0-9.\-]+$/, "Use a ticker like NVDA or ETH")
  .transform((s) => s.replace(/^\$/, "").toUpperCase());

export const THESIS_STANCES = ["bullish", "bearish", "neutral"] as const;
export type ThesisStance = (typeof THESIS_STANCES)[number];

export const createThesisSchema = z.object({
  title: z.string().trim().min(1, "Name the thesis").max(200),
  statement: z.string().trim().min(1, "State the thesis").max(10_000),
  stance: z.enum(THESIS_STANCES).default("bullish"),
  conviction: z.coerce.number().int().min(1).max(5).default(3),
  symbols: z.array(symbol).max(10).default([]),
});
export type CreateThesisInput = z.input<typeof createThesisSchema>;

export const updateThesisSchema = z
  .object({
    stance: z.enum(THESIS_STANCES),
    conviction: z.coerce.number().int().min(1).max(5),
    status: z.enum(["active", "closed"]),
    note: z.string().trim().max(2000).optional(),
  })
  .partial();
export type UpdateThesisInput = z.input<typeof updateThesisSchema>;

export const thesisEvidenceSchema = z.object({
  memoryId: z.uuid(),
  relation: z.enum(["supports", "contradicts"]),
});

export const watchlistItemSchema = z.object({
  symbol,
  name: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
});

export const watchlistNoteSchema = z.object({ note: z.string().trim().max(500).nullable() });

export const researchRequestSchema = z.object({
  query: z.string().trim().min(3, "Ask a research question").max(1000),
});

export const insightStatusSchema = z.object({ status: z.enum(["new", "seen", "dismissed"]) });

// ---------- Phase 3: actions and connections ----------

const decimal = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,8})?$/, "Use a positive number with up to 8 decimals")
  .refine((v) => Number(v) > 0, "Must be greater than zero");

export const ACTION_SIDES = ["buy", "sell"] as const;

export const createActionSchema = z.object({
  side: z.enum(ACTION_SIDES),
  symbol,
  quantity: z.union([decimal, z.number().positive().transform(String)]),
  price: z.union([decimal, z.number().positive().transform(String)]).nullish(),
  reasoning: z.string().trim().min(3, "Say why").max(4000),
});
export type CreateActionInput = z.input<typeof createActionSchema>;

export const approveActionSchema = z.object({
  /** The confirmation phrase the user typed, e.g. "SELL 8.27 NVDA". */
  phrase: z.string().trim().min(1).max(100),
});

export const rejectActionSchema = z.object({ reason: z.string().trim().max(1000).optional() });

export const walletConnectionSchema = z.object({
  address: z.string().trim().regex(/^0x[0-9a-fA-F]{40}$/, "Enter a 0x wallet address"),
  network: z.enum(["mainnet", "testnet"]).default("mainnet"),
  label: z.string().trim().max(80).optional(),
});
