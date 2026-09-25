import { graphFilterSchema } from "@jarvis/types";
import { requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { handle, listParam } from "@/server/http";

export const GET = handle(async (request: Request) => {
  const user = await requireUser();
  const url = new URL(request.url);
  const filter = graphFilterSchema.parse({
    types: listParam(url, "types"),
    until: url.searchParams.get("until") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  const { knowledge } = await services();
  return Response.json(await knowledge.graph(user.id, filter));
});
