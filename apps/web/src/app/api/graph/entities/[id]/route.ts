import { z } from "zod";
import { requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { handle, HttpError } from "@/server/http";

export const GET = handle(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const id = z.uuid().parse((await params).id);
  const depth = z.coerce.number().int().min(1).max(3).default(1).parse(new URL(request.url).searchParams.get("depth") ?? undefined);
  const { knowledge } = await services();
  const details = await knowledge.entityDetails(user.id, id);
  if (!details) throw new HttpError(404, "Entity not found");
  const neighborhood = await knowledge.neighborhood(user.id, id, depth);
  return Response.json({ ...details, neighborhood });
});
