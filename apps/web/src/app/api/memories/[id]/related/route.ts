import { z } from "zod";
import { requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { handle } from "@/server/http";

export const GET = handle(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const id = z.uuid().parse((await params).id);
  const { memory } = await services();
  return Response.json(await memory.related(user.id, id));
});
