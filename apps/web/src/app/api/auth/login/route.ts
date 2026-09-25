import { credentialsSchema } from "@jarvis/types";
import { createSession, signIn } from "@/server/auth";
import { body, handle } from "@/server/http";

export const POST = handle(async (request: Request) => {
  const { email, password } = credentialsSchema.pick({ email: true, password: true }).parse(await body(request));
  const user = await signIn(email, password);
  await createSession(user.id);
  return Response.json({ user });
});
