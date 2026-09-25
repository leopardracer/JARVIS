import { z } from "zod";
import { updateMemorySchema } from "@jarvis/types";
import { audit, requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { body, handle, HttpError } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };
const idSchema = z.uuid();

export const GET = handle(async (_request: Request, { params }: Ctx) => {
  const user = await requireUser();
  const id = idSchema.parse((await params).id);
  const { memory } = await services();
  const found = await memory.get(user.id, id);
  if (!found) throw new HttpError(404, "Memory not found");
  return Response.json(found);
});

export const PATCH = handle(async (request: Request, { params }: Ctx) => {
  const user = await requireUser();
  const id = idSchema.parse((await params).id);
  const patch = updateMemorySchema.parse(await body(request));
  const { memory } = await services();
  const updated = await memory.update(user.id, id, patch);
  if (!updated) throw new HttpError(404, "Memory not found");
  await audit(user.id, "memory.update", {}, { type: "memory", id });
  return Response.json(updated);
});

export const DELETE = handle(async (_request: Request, { params }: Ctx) => {
  const user = await requireUser();
  const id = idSchema.parse((await params).id);
  const { memory } = await services();
  if (!(await memory.remove(user.id, id))) throw new HttpError(404, "Memory not found");
  await audit(user.id, "memory.delete", {}, { type: "memory", id });
  return new Response(null, { status: 204 });
});
