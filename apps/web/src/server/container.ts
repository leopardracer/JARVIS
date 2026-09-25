import "server-only";
import { randomUUID } from "node:crypto";
import { createAIProvider, createEmbeddingProvider, type AIProvider, type EmbeddingProvider } from "@jarvis/ai";
import { createDatabase, databaseConfigFromEnv, type DatabaseHandle } from "@jarvis/db";
import { MemoryService, seedDemo } from "@jarvis/memory";
import type { KnowledgeService } from "@jarvis/knowledge";

export type Services = {
  database: DatabaseHandle;
  db: DatabaseHandle["db"];
  ai: AIProvider;
  embedder: EmbeddingProvider;
  memory: MemoryService;
  knowledge: KnowledgeService;
  /** Builds a fresh, private demo workspace from the fictional seed. */
  createDemoWorkspace: () => Promise<string>;
};

const globalForJarvis = globalThis as unknown as { jarvis?: Promise<Services> };

async function boot(): Promise<Services> {
  const database = await createDatabase(databaseConfigFromEnv());
  await database.migrate();
  const ai = createAIProvider();
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
    createDemoWorkspace: async () => {
      // Every visitor gets their own copy, so nobody sees what another visitor typed.
      const email = `demo-${randomUUID()}@demo.jarvis.local`;
      return (await seedDemo(database.db, seeder, { email })).userId;
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
