import { z } from "zod";
import { updateThesisSchema } from "@jarvis/types";
import { audit, requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { body, handle, HttpError } from "@/server/http";
import { thesisDetail, updateThesis } from "@/server/theses";

type Ctx = { params: Promise<{ id: string }> };
const idSchema = z.uuid();

export const GET = handle(async (_request: Request, { params }: Ctx) => {
  const user = await requireUser();
  const id = idSchema.parse((await params).id);
  const { db } = await services();
  const found = await thesisDetail(db, user.id, id);
  if (!found) throw new HttpError(404, "Thesis not found");
  return Response.json(found);
});

export const PATCH = handle(async (request: Request, { params }: Ctx) => {
  const user = await requireUser();
  const id = idSchema.parse((await params).id);
  const svc = await services();
  const row = await updateThesis(svc, user.id, id, updateThesisSchema.parse(await body(request)));
  await audit(user.id, "thesis.update", {}, { type: "thesis", id });
  // A change of conviction can change what JARVIS should flag.
  await svc.insights.run(user.id);
  return Response.json(row);
});
