import { researchRequestSchema } from "@jarvis/types";
import { audit, requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { body, handle } from "@/server/http";
import { researchView } from "@/server/queries";
import { runResearch } from "@/server/research";

export const GET = handle(async () => {
  const user = await requireUser();
  const { db } = await services();
  return Response.json(await researchView(db, user.id));
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser();
  const { query } = researchRequestSchema.parse(await body(request));
  const svc = await services();
  const row = await runResearch(svc, user.id, query);
  await audit(user.id, "research.run", { status: row.status }, { type: "research", id: row.id });
  if (row.status === "done") await svc.insights.run(user.id);
  return Response.json(row, { status: row.status === "failed" ? 502 : 201 });
});
