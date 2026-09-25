import { z } from "zod";
import { requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { handle, HttpError } from "@/server/http";
import { summarizeEntity } from "@/server/reasoning";

export const POST = handle(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const id = z.uuid().parse((await params).id);
  const s = await services();
  const summary = await summarizeEntity(s, user.id, id);
  if (!summary) throw new HttpError(404, "Entity not found");
  return Response.json(summary);
});
