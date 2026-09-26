import { audit, requireUser } from "@/server/auth";
import { addWalletConnection, listConnections } from "@/server/connections";
import { services } from "@/server/container";
import { body, handle } from "@/server/http";

export const GET = handle(async () => {
  const user = await requireUser();
  const { db } = await services();
  return Response.json(await listConnections(db, user.id));
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser();
  const svc = await services();
  const id = await addWalletConnection(svc, user.id, await body(request));
  await audit(user.id, "connection.add", { provider: "robinhood-chain", readOnly: true }, { type: "connection", id });
  return Response.json({ id }, { status: 201 });
});
