import { eq } from "drizzle-orm";
import { schema } from "@jarvis/db";
import { watchlistItemSchema } from "@jarvis/types";
import { audit, requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { body, handle } from "@/server/http";
import { watchlistView } from "@/server/queries";
import { ensureAsset } from "@/server/theses";

export const GET = handle(async () => {
  const user = await requireUser();
  const { db } = await services();
  return Response.json(await watchlistView(db, user.id));
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser();
  const input = watchlistItemSchema.parse(await body(request));
  const { db, memory } = await services();
  let [list] = await db.select().from(schema.watchlists).where(eq(schema.watchlists.userId, user.id)).orderBy(schema.watchlists.createdAt).limit(1);
  if (!list) [list] = await db.insert(schema.watchlists).values({ userId: user.id, name: "Core" }).returning();
  const asset = await ensureAsset(memory, user.id, input.symbol, input.name);
  await db
    .insert(schema.watchlistItems)
    .values({ watchlistId: list.id, assetEntityId: asset.id, note: input.note || null })
    .onConflictDoUpdate({ target: [schema.watchlistItems.watchlistId, schema.watchlistItems.assetEntityId], set: { note: input.note || null } });
  await memory.recordActivity(user.id, "watchlist_added", "entity", asset.id, `Watching ${input.symbol}${input.note ? `: ${input.note}` : ""}`);
  await audit(user.id, "watchlist.add", { symbol: input.symbol }, { type: "entity", id: asset.id });
  return Response.json({ assetId: asset.id, symbol: input.symbol }, { status: 201 });
});
