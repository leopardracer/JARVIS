import "server-only";
import { z } from "zod";
import { ProviderConfigError } from "@jarvis/ai";
import { ApprovalError, SecretsConfigError } from "@jarvis/broker";
import { AuthError } from "./auth";

import { HttpError } from "./errors";

export { HttpError };

/** Wrap a route handler: consistent JSON errors, no stack traces to the client. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return Response.json({ error: "Invalid request", issues: z.flattenError(error).fieldErrors }, { status: 400 });
      }
      if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
      if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
      if (error instanceof ProviderConfigError || error instanceof SecretsConfigError) return Response.json({ error: error.message }, { status: 503 });
      if (error instanceof ApprovalError) return Response.json({ error: error.message }, { status: 409 });
      console.error(error);
      return Response.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}

export async function body(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Expected a JSON body");
  }
}

/** Read repeated or comma-separated query params into an array. */
export function listParam(url: URL, key: string): string[] | undefined {
  const values = url.searchParams.getAll(key).flatMap((v) => v.split(",")).filter(Boolean);
  return values.length ? values : undefined;
}
