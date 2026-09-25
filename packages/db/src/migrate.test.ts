import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createDatabase } from "./client";

describe("migrations", () => {
  it("apply cleanly to an empty database", async () => {
    const h = await createDatabase({ dataDir: "memory://" });
    await h.migrate();
    const rows = await h.db.execute(sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`);
    expect((rows as unknown as { rows: { n: number }[] }).rows[0].n).toBeGreaterThanOrEqual(24);
    await h.close();
  });
});
