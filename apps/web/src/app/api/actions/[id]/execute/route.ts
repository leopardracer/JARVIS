import { z } from "zod";
import { executeAction } from "@/server/actions";
import { audit, requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { handle, HttpError } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

/** The user's explicit second step after approval. Never called by JARVIS itself. */
export const POST = handle(async (_request: Request, { params }: Ctx) => {
  const user = await requireUser();
  const id = z.uuid().parse((await params).id);
  const svc = await services();
  await audit(user.id, "action.execute_requested", {}, { type: "action", id });
  try {
    const action = await executeAction(svc, user.id, id);
    await audit(user.id, action.executionStatus === "executed" ? "action.executed" : "action.execution_failed", { provider: action.provider, dataMode: action.dataMode, result: action.executionResult }, { type: "action", id });
    if (action.executionStatus === "executed") await svc.insights.run(user.id);
    return Response.json(action, { status: action.executionStatus === "executed" ? 200 : 502 });
  } catch (error) {
    if (error instanceof HttpError) await audit(user.id, "action.execute_refused", { reason: error.message }, { type: "action", id });
    throw error;
  }
});
