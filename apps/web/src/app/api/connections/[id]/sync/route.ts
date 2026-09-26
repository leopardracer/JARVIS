import { z } from "zod";
import { audit, requireUser } from "@/server/auth";
import { syncConnection } from "@/server/connections";
import { services } from "@/server/container";
import { handle } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (_request: Request, { params }: Ctx) => {
  const user = await requireUser();
  const id = z.uuid().parse((await params).id);
  const svc = await services();
  const result = await syncConnection(svc, user.id, id);
  await audit(user.id, "connection.sync", { positions: result.positions }, { type: "connection", id });
  await svc.insights.run(user.id);
  return Response.json({ positions: result.positions });
});
