import { z } from "zod";
import { thesisEvidenceSchema } from "@jarvis/types";
import { audit, requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { body, handle } from "@/server/http";
import { linkEvidence, unlinkEvidence } from "@/server/theses";

type Ctx = { params: Promise<{ id: string }> };
const idSchema = z.uuid();

export const POST = handle(async (request: Request, { params }: Ctx) => {
  const user = await requireUser();
  const id = idSchema.parse((await params).id);
  const input = thesisEvidenceSchema.parse(await body(request));
  const svc = await services();
  await linkEvidence(svc, user.id, id, input.memoryId, input.relation);
  await audit(user.id, "thesis.evidence", { memoryId: input.memoryId, relation: input.relation }, { type: "thesis", id });
  const run = await svc.insights.run(user.id);
  return Response.json({ ok: true, insights: run.created }, { status: 201 });
});

export const DELETE = handle(async (request: Request, { params }: Ctx) => {
  const user = await requireUser();
  const id = idSchema.parse((await params).id);
  const memoryId = idSchema.parse(new URL(request.url).searchParams.get("memoryId"));
  const svc = await services();
  await unlinkEvidence(svc, user.id, id, memoryId);
  return new Response(null, { status: 204 });
});
