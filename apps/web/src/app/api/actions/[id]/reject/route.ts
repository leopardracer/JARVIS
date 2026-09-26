import { z } from "zod";
import { rejectActionSchema } from "@jarvis/types";
import { rejectAction } from "@/server/actions";
import { audit, requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { body, handle } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (request: Request, { params }: Ctx) => {
  const user = await requireUser();
  const id = z.uuid().parse((await params).id);
  const { reason } = rejectActionSchema.parse(await body(request).catch(() => ({})));
  const svc = await services();
  const action = await rejectAction(svc, user.id, id, reason);
  await audit(user.id, "action.reject", { reason: reason ?? null }, { type: "action", id });
  return Response.json(action);
});
