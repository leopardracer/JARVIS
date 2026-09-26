import { z } from "zod";
import { actionDetail } from "@/server/actions";
import { requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { handle, HttpError } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_request: Request, { params }: Ctx) => {
  const user = await requireUser();
  const id = z.uuid().parse((await params).id);
  const { db } = await services();
  const found = await actionDetail(db, user.id, id);
  if (!found) throw new HttpError(404, "Action not found");
  return Response.json(found);
});
