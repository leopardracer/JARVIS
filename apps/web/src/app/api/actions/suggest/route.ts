import { suggestActions } from "@/server/actions";
import { audit, requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { handle } from "@/server/http";

/** JARVIS proposes; every proposal waits for the user's review. Nothing here executes. */
export const POST = handle(async () => {
  const user = await requireUser();
  const svc = await services();
  await svc.insights.run(user.id);
  const created = await suggestActions(svc, user.id);
  for (const a of created) {
    await audit(user.id, "action.propose", { side: a.type, quantity: a.quantity, dataMode: a.dataMode, proposedBy: "ai", method: a.context.method }, { type: "action", id: a.id });
  }
  return Response.json({ created: created.map((a) => ({ id: a.id })) });
});
