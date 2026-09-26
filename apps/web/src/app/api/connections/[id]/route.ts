import { z } from "zod";
import { audit, requireUser } from "@/server/auth";
import { removeConnection } from "@/server/connections";
import { services } from "@/server/container";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handle(async (_request: Request, { params }: Ctx) => {
  const user = await requireUser();
  const id = z.uuid().parse((await params).id);
  const svc = await services();
  await removeConnection(svc, user.id, id);
  await audit(user.id, "connection.remove", {}, { type: "connection", id });
  return new Response(null, { status: 204 });
});
