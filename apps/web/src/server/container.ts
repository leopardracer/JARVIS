import "server-only";
import { randomUUID } from "node:crypto";
import { createAIProvider, createEmbeddingProvider, MockProvider, type AIProvider, type EmbeddingProvider } from "@jarvis/ai";
import { createDatabase, databaseConfigFromEnv, findRepoRoot, type DatabaseHandle } from "@jarvis/db";
import { MemoryService, seedDemo } from "@jarvis/memory";
import { suggestActions } from "./actions";
import path from "node:path";
import { ApprovalSigner, createBrokerProvider, masterKeyFromEnv, SecretBox, type BrokerProvider } from "@jarvis/broker";
import { InsightEngine, type KnowledgeService } from "@jarvis/knowledge";

export type Services = {
  database: DatabaseHandle;
  db: DatabaseHandle["db"];
  ai: AIProvider;
  embedder: EmbeddingProvider;
  memory: MemoryService;
  knowledge: KnowledgeService;
  insights: InsightEngine;
  /** Brokerage used for demo syncs. */
  demoBroker: BrokerProvider;
  /** Seals broker credentials (AES-256-GCM). */
  secrets: SecretBox;
  /** Signs approved orders so a provider can verify them before acting. */
  signer: ApprovalSigner;
  /** Builds a fresh, private demo workspace from the fictional seed. */
  createDemoWorkspace: () => Promise<string>;
};

const globalForJarvis = globalThis as unknown as { jarvis?: Promise<Services> };

async function boot(): Promise<Services> {
  const database = await createDatabase(databaseConfigFromEnv());
  await database.migrate();
  const ai = createAIProvider();
  // Resolved on first use, so a deployment without JARVIS_ENCRYPTION_KEY still serves
  // everything except connections and order submission (which then answer 503).
  // Without the key (development only) a random key lives next to the local database.
  let keys: { secrets: SecretBox; signer: ApprovalSigner } | undefined;
  const keyring = () => {
    if (!keys) {
      const master = masterKeyFromEnv(process.env, { devKeyDir: path.join(findRepoRoot(), ".jarvis-data") });
      keys = { secrets: new SecretBox(master), signer: new ApprovalSigner(master) };
    }
    return keys;
  };
  const embedder = createEmbeddingProvider();
  const memory = new MemoryService({ db: database.db, ai, embedder });
  // Seeding uses rule-based extraction only, so a demo visit never costs LLM calls.
  const seeder = new MemoryService({ db: database.db, ai, embedder, llmExtraction: false });
  return {
    database,
    db: database.db,
    ai,
    embedder,
    memory,
    knowledge: memory.knowledge,
    insights: new InsightEngine(database.db),
    demoBroker: createBrokerProvider(),
    get secrets() {
      return keyring().secrets;
    },
    get signer() {
      return keyring().signer;
    },
    createDemoWorkspace: async () => {
      // Every visitor gets their own copy, so nobody sees what another visitor typed.
      const email = `demo-${randomUUID()}@demo.jarvis.local`;
      const { userId } = await seedDemo(database.db, seeder, { email });
      // The demo opens with JARVIS's own proposals waiting for review, never executed.
      // Rule-based only, like the rest of the seed, so a demo visit costs no model calls.
      await suggestActions({ db: database.db, memory: seeder, ai: new MockProvider(), get signer() { return keyring().signer; } }, userId);
      return userId;
    },
  };
}

/** One set of services per server process (survives dev hot reloads). */
export function services(): Promise<Services> {
  if (!globalForJarvis.jarvis) {
    globalForJarvis.jarvis = boot().catch((error) => {
      globalForJarvis.jarvis = undefined;
      throw error;
    });
  }
  return globalForJarvis.jarvis;
}
