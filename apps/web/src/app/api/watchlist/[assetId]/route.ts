import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { schema, type Database } from "@jarvis/db";
import { watchlistNoteSchema } from "@jarvis/types";
import { requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { body, handle, HttpError } from "@/server/http";

type Ctx = { params: Promise<{ assetId: string }> };

async function ownLists(db: Database, userId: string) {
  const lists = await db.select({ id: schema.watchlists.id }).from(schema.watchlists).where(eq(schema.watchlists.userId, userId));
  if (!lists.length) throw new HttpError(404, "Not on your watchlist");
  return lists.map((l) => l.id);
}

export const PATCH = handle(async (request: Request, { params }: Ctx) => {
  const user = await requireUser();
  const assetId = z.uuid().parse((await params).assetId);
  const { note } = watchlistNoteSchema.parse(await body(request));
  const { db } = await services();
  const rows = await db
    .update(schema.watchlistItems)
    .set({ note: note || null })
    .where(and(inArray(schema.watchlistItems.watchlistId, await ownLists(db, user.id)), eq(schema.watchlistItems.assetEntityId, assetId)))
    .returning();
  if (!rows.length) throw new HttpError(404, "Not on your watchlist");
  return Response.json(rows[0]);
});

export const DELETE = handle(async (_request: Request, { params }: Ctx) => {
  const user = await requireUser();
  const assetId = z.uuid().parse((await params).assetId);
  const { db, memory } = await services();
  const rows = await db
    .delete(schema.watchlistItems)
    .where(and(inArray(schema.watchlistItems.watchlistId, await ownLists(db, user.id)), eq(schema.watchlistItems.assetEntityId, assetId)))
    .returning();
  if (!rows.length) throw new HttpError(404, "Not on your watchlist");
  const asset = await memory.knowledge.getEntity(user.id, assetId);
  await memory.recordActivity(user.id, "watchlist_removed", "entity", assetId, `Stopped watching ${asset?.symbol ?? asset?.name ?? "an asset"}`);
  return new Response(null, { status: 204 });
});
