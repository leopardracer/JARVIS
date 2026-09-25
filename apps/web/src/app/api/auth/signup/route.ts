import { credentialsSchema } from "@jarvis/types";
import { createSession, signUp } from "@/server/auth";
import { body, handle } from "@/server/http";

export const POST = handle(async (request: Request) => {
  const { email, password, displayName } = credentialsSchema.parse(await body(request));
  const user = await signUp(email, password, displayName);
  await createSession(user.id);
  return Response.json({ user }, { status: 201 });
});
