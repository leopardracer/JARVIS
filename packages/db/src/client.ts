import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzlePglite<typeof schema>>;

export type DatabaseConfig = {
  /** postgres:// URL. When absent, an embedded PGlite database is used. */
  url?: string;
  /** PGlite data directory. `memory://` keeps everything in memory (tests). */
  dataDir?: string;
};

export type DatabaseHandle = {
  db: Database;
  kind: "postgres" | "pglite";
  migrate: () => Promise<void>;
  close: () => Promise<void>;
};

export function migrationsFolder(): string {
  return (
    process.env.JARVIS_MIGRATIONS_DIR ??
    path.resolve(findRepoRoot(), "infrastructure/migrations")
  );
}

export function findRepoRoot(): string {
  // Works from the repo root, apps/web and packages/* alike.
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    if (path.basename(dir) === "web" || path.basename(path.dirname(dir)) === "packages") {
      dir = path.dirname(dir);
      continue;
    }
    if (path.basename(dir) === "apps") {
      dir = path.dirname(dir);
      continue;
    }
    break;
  }
  return dir;
}

export async function createDatabase(config: DatabaseConfig = {}): Promise<DatabaseHandle> {
  if (config.url) {
    const client = postgres(config.url, { max: 10 });
    const db = drizzlePostgres(client, { schema }) as unknown as Database;
    return {
      db,
      kind: "postgres",
      migrate: () =>
        migratePostgres(db as never, { migrationsFolder: migrationsFolder() }),
      close: () => client.end(),
    };
  }

  const dataDir = config.dataDir ?? path.resolve(findRepoRoot(), ".jarvis-data/pglite");
  if (dataDir !== "memory://") mkdirSync(path.dirname(dataDir), { recursive: true });
  const client = await PGlite.create({
    dataDir: dataDir === "memory://" ? undefined : dataDir,
    extensions: { vector },
  });
  const db = drizzlePglite(client, { schema });
  return {
    db,
    kind: "pglite",
    migrate: () => migratePglite(db, { migrationsFolder: migrationsFolder() }),
    close: () => client.close(),
  };
}

export function databaseConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  return { url: env.DATABASE_URL || undefined, dataDir: env.PGLITE_DATA_DIR || undefined };
}
