import { createAgentSchema } from "@jarvis/types";
import { createAgent, listAgents } from "@/server/agents";
import { audit, requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { body, handle } from "@/server/http";

export const GET = handle(async () => {
  const user = await requireUser();
  const { db } = await services();
  return Response.json(await listAgents(db, user.id));
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser();
  const input = createAgentSchema.parse(await body(request));
  const { db } = await services();
  const row = await createAgent(db, user.id, input);
  await audit(user.id, "agent.create", { name: row.name, cadence: row.cadence }, { type: "agent", id: row.id });
  return Response.json(row, { status: 201 });
});
