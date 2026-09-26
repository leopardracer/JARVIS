import { z } from "zod";
import { approveActionSchema } from "@jarvis/types";
import { approveAction } from "@/server/actions";
import { audit, requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { body, handle, HttpError } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (request: Request, { params }: Ctx) => {
  const user = await requireUser();
  const id = z.uuid().parse((await params).id);
  const { phrase } = approveActionSchema.parse(await body(request));
  const svc = await services();
  try {
    const { action, approval } = await approveAction(svc, user.id, id, phrase);
    await audit(user.id, "action.approve", { approvalId: approval.id, confirmationHash: approval.confirmationHash, expiresAt: approval.expiresAt }, { type: "action", id });
    return Response.json({ action, approvalExpiresAt: approval.expiresAt });
  } catch (error) {
    if (error instanceof HttpError) await audit(user.id, "action.approve_refused", { reason: error.message }, { type: "action", id });
    throw error;
  }
});
