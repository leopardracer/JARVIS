import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@jarvis/db";
import { insightStatusSchema } from "@jarvis/types";
import { requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { body, handle, HttpError } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (request: Request, { params }: Ctx) => {
  const user = await requireUser();
  const id = z.uuid().parse((await params).id);
  const { status } = insightStatusSchema.parse(await body(request));
  const { db } = await services();
  const [row] = await db
    .update(schema.insights)
    .set({ status })
    .where(and(eq(schema.insights.id, id), eq(schema.insights.userId, user.id)))
    .returning();
  if (!row) throw new HttpError(404, "Insight not found");
  return Response.json(row);
});
