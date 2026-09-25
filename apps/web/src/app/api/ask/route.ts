import { askSchema, type AskEvent } from "@jarvis/types";
import { requireUser } from "@/server/auth";
import { services } from "@/server/container";
import { body, handle } from "@/server/http";
import { answer } from "@/server/reasoning";

/** Streams newline-delimited JSON AskEvents: sources, text chunks, done. */
export const POST = handle(async (request: Request) => {
  const user = await requireUser();
  const { question, conversationId } = askSchema.parse(await body(request));
  const s = await services();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AskEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      try {
        for await (const event of answer(s, user.id, question, conversationId)) send(event);
      } catch (error) {
        console.error(error);
        send({ type: "error", message: "Something went wrong while answering." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
});
