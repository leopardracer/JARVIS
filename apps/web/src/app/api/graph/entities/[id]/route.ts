import { z } from "zod";
import { describePath, GraphInference, nodeLabel } from "@jarvis/knowledge";
import { requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { handle, HttpError } from "@/server/http";

export const GET = handle(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const id = z.uuid().parse((await params).id);
  const depth = z.coerce.number().int().min(1).max(3).default(1).parse(new URL(request.url).searchParams.get("depth") ?? undefined);
  const { knowledge, db } = await services();
  const details = await knowledge.entityDetails(user.id, id);
  if (!details) throw new HttpError(404, "Entity not found");
  const neighborhood = await knowledge.neighborhood(user.id, id, depth);
  const inference = new GraphInference(db);
  const idx = await inference.index(user.id);
  const similar = inference.similarities(idx, { entityId: id, min: 0.2 }).slice(0, 5).map((s) => {
    const other = s.a.id === id ? s.b : s.a;
    return { id: other.id, name: nodeLabel(other), score: s.score, reason: s.reason, linked: s.linked };
  });
  const impact = idx.held.has(id)
    ? []
    : inference.impactPaths(idx, id).map((p) => ({ id: p.target.id, name: nodeLabel(p.target), share: p.share, path: describePath(idx.nodes.get(id)!, p.steps) }));
  return Response.json({ ...details, neighborhood, similar, impact });
});
