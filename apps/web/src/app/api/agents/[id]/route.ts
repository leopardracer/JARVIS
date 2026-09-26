import { z } from "zod";
import { deleteAgent, updateAgent } from "@/server/agents";
import { audit, requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { body, handle } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (request: Request, { params }: Ctx) => {
  const user = await requireUser();
  const id = z.uuid().parse((await params).id);
  const { db } = await services();
  const row = await updateAgent(db, user.id, id, await body(request));
  await audit(user.id, "agent.update", { enabled: row.enabled, cadence: row.cadence }, { type: "agent", id });
  return Response.json(row);
});

export const DELETE = handle(async (_request: Request, { params }: Ctx) => {
  const user = await requireUser();
  const id = z.uuid().parse((await params).id);
  const { db } = await services();
  await deleteAgent(db, user.id, id);
  await audit(user.id, "agent.delete", {}, { type: "agent", id });
  return new Response(null, { status: 204 });
});
