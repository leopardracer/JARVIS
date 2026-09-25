import { createMemorySchema, memoryFilterSchema } from "@jarvis/types";
import { audit, requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { body, handle, listParam } from "@/server/http";

export const GET = handle(async (request: Request) => {
  const user = await requireUser();
  const url = new URL(request.url);
  const filter = memoryFilterSchema.parse({
    types: listParam(url, "types"),
    tags: listParam(url, "tags"),
    entityIds: listParam(url, "entityIds"),
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  const { memory } = await services();
  return Response.json(await memory.list(user.id, filter));
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser();
  const input = createMemorySchema.parse(await body(request));
  const { memory } = await services();
  const created = await memory.create(user.id, input);
  await audit(user.id, "memory.create", {}, { type: "memory", id: created.id });
  return Response.json(created, { status: 201 });
});
