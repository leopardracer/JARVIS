import { searchQuerySchema } from "@jarvis/types";
import { requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { handle, listParam } from "@/server/http";

export const GET = handle(async (request: Request) => {
  const user = await requireUser();
  const url = new URL(request.url);
  const query = searchQuerySchema.parse({
    q: url.searchParams.get("q") ?? "",
    mode: url.searchParams.get("mode") ?? undefined,
    types: listParam(url, "types"),
    limit: url.searchParams.get("limit") ?? undefined,
  });
  const { memory } = await services();
  return Response.json(await memory.search(user.id, query));
});
