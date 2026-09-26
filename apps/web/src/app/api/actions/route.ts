import { createActionSchema } from "@jarvis/types";
import { actionsView, createAction } from "@/server/actions";
import { audit, requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { body, handle } from "@/server/http";

export const GET = handle(async () => {
  const user = await requireUser();
  const { db } = await services();
  return Response.json(await actionsView(db, user.id));
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser();
  const input = createActionSchema.parse(await body(request));
  const svc = await services();
  const row = await createAction(svc, user.id, input, { proposedBy: "user" });
  await audit(user.id, "action.propose", { side: row.type, symbol: input.symbol, quantity: row.quantity, dataMode: row.dataMode, proposedBy: "user" }, { type: "action", id: row.id });
  return Response.json(row, { status: 201 });
});
