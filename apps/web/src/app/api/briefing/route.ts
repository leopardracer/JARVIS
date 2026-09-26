import { z } from "zod";
import { BRIEFING_PERIODS } from "@jarvis/types";
import { buildBriefing, currentBriefing } from "@/server/briefing";
import { requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { body, handle } from "@/server/http";

const periodSchema = z.object({ period: z.enum(BRIEFING_PERIODS).default("weekly") });

export const GET = handle(async (request: Request) => {
  const user = await requireUser();
  const { period } = periodSchema.parse({ period: new URL(request.url).searchParams.get("period") ?? undefined });
  return Response.json(await currentBriefing(await services(), user.id, period));
});

/** Rebuild now, instead of waiting for the half-hour refresh. */
export const POST = handle(async (request: Request) => {
  const user = await requireUser();
  const { period } = periodSchema.parse(await body(request));
  return Response.json(await buildBriefing(await services(), user.id, period));
});
