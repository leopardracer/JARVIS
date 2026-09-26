import { timingSafeEqual } from "node:crypto";
import { runScheduled } from "@/server/scheduler";
import { services } from "@/server/container";
import { handle, HttpError } from "@/server/http";

export const maxDuration = 300;

/**
 * Called by an external scheduler (cron, Vercel Cron, a GitHub Actions
 * schedule) with `Authorization: Bearer $CRON_SECRET`. Runs due agents for
 * live accounts and refreshes their daily briefings.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new HttpError(503, "Set CRON_SECRET to enable the scheduler endpoint");
  const given = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const want = Buffer.from(secret);
  if (given.length !== want.length || !timingSafeEqual(given, want)) throw new HttpError(401, "Not authorized");
  return Response.json(await runScheduled(await services()));
}

export const GET = handle(run);
export const POST = handle(run);
