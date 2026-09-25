import { createThesisSchema } from "@jarvis/types";
import { audit, requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { body, handle } from "@/server/http";
import { thesesView } from "@/server/queries";
import { createThesis } from "@/server/theses";

export const GET = handle(async () => {
  const user = await requireUser();
  const { db } = await services();
  return Response.json(await thesesView(db, user.id));
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser();
  const svc = await services();
  const row = await createThesis(svc, user.id, createThesisSchema.parse(await body(request)));
  await audit(user.id, "thesis.create", {}, { type: "thesis", id: row.id });
  return Response.json(row, { status: 201 });
});
