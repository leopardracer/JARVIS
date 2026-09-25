import Anthropic from "@anthropic-ai/sdk";
import { JARVIS_MODEL, SYSTEM_PROMPT, chatRequestSchema } from "@/lib/jarvis";

const client = new Anthropic();

export async function POST(request: Request) {
  const parsed = chatRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const stream = client.beta.messages.stream({
    model: JARVIS_MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: parsed.data.messages,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    // On a policy decline, the API re-runs the request on a recommended model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(
            encoder.encode("\n\n[JARVIS не может ответить на этот запрос.]"),
          );
        }
        controller.close();
      } catch (error) {
        console.error("Claude API error", error);
        controller.error(error);
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
