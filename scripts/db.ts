/**
 * npm run db:migrate            apply migrations
 * npm run db:seed [email]       migrate, then create a fictional demo workspace
 *
 * Uses DATABASE_URL when set, otherwise the embedded PGlite database in .jarvis-data/.
 */
import { createAIProvider, createEmbeddingProvider } from "@jarvis/ai";
import { createDatabase, databaseConfigFromEnv } from "@jarvis/db";
import { DEMO_EMAIL, MemoryService, seedDemo } from "@jarvis/memory";

const [command, email = DEMO_EMAIL] = process.argv.slice(2);
const handle = await createDatabase(databaseConfigFromEnv());
try {
  await handle.migrate();
  console.log(`Migrations applied (${handle.kind}).`);
  if (command === "seed") {
    const ai = createAIProvider();
    const memory = new MemoryService({ db: handle.db, ai, embedder: createEmbeddingProvider(), llmExtraction: false });
    const result = await seedDemo(handle.db, memory, { email });
    console.log(result.created ? `Demo workspace created for ${email}.` : `${email} already exists; nothing to do.`);
  }
} finally {
  await handle.close();
}
