import { audit, requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { handle } from "@/server/http";

export const POST = handle(async () => {
  const user = await requireUser();
  const { insights } = await services();
  const run = await insights.run(user.id);
  await audit(user.id, "insights.run", { found: run.drafts.length, created: run.created.length });
  return Response.json({ found: run.drafts.length, created: run.created });
});
