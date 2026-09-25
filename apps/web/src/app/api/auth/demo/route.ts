import { audit, createSession } from "@/server/auth";
import { services } from "@/server/container";
import { handle, HttpError } from "@/server/http";

/** One-click access to the fictional demo workspace. Disable with JARVIS_DISABLE_DEMO=1. */
export const POST = handle(async () => {
  if (process.env.JARVIS_DISABLE_DEMO === "1") throw new HttpError(404, "Demo is disabled");
  const { createDemoWorkspace } = await services();
  const userId = await createDemoWorkspace();
  await createSession(userId);
  await audit(userId, "auth.demo_sign_in");
  return Response.json({ ok: true });
});
