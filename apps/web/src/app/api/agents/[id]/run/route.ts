import { z } from "zod";
import { runAgent } from "@/server/agents";
import { audit, requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { handle } from "@/server/http";

/** Run an agent now instead of waiting for its turn. */
export const POST = handle(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const id = z.uuid().parse((await params).id);
  const svc = await services();
  const run = await runAgent(svc, user.id, id);
  await audit(user.id, "agent.run", { status: run.status, trigger: "manual" }, { type: "agent", id });
  if (run.status === "done") await svc.insights.run(user.id);
  return Response.json(run);
});
