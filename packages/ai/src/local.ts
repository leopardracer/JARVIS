import { z } from "zod";
import type { AIProvider, CompletionRequest, EmbeddingProvider, ExtractRequest } from "./types";

/**
 * A local model served by Ollama (https://github.com/ollama/ollama/blob/main/docs/api.md).
 * Uses the documented /api/chat and /api/embed endpoints.
 */
export class LocalProvider implements AIProvider {
  readonly name = "local" as const;
  readonly isLanguageModel = true;

  constructor(
    private baseUrl: string,
    readonly model: string,
  ) {}

  async complete(req: CompletionRequest) {
    let text = "";
    for await (const chunk of this.stream(req)) text += chunk;
    return { text, stopReason: "stop" };
  }

  async *stream(req: CompletionRequest) {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: true,
        messages: [{ role: "system", content: req.system }, ...req.messages],
      }),
    });
    if (!res.ok || !res.body) throw new Error(`Local model error: HTTP ${res.status}`);
    for await (const line of readLines(res.body)) {
      const data = JSON.parse(line) as { message?: { content?: string }; error?: string };
      if (data.error) throw new Error(data.error);
      if (data.message?.content) yield data.message.content;
    }
  }

  async extract<T>(req: ExtractRequest<T>): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        format: z.toJSONSchema(req.schema),
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.prompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Local model error: HTTP ${res.status}`);
    const data = (await res.json()) as { message: { content: string } };
    return req.schema.parse(JSON.parse(data.message.content));
  }
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local" as const;

  constructor(
    private baseUrl: string,
    readonly model: string,
    readonly dimensions: number,
  ) {}

  async embed(texts: string[]) {
    if (texts.length === 0) return [];
    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) throw new Error(`Local embedding error: HTTP ${res.status}`);
    const data = (await res.json()) as { embeddings: number[][] };
    return data.embeddings;
  }
}

async function* readLines(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) yield line;
    }
  }
  if (buffer.trim()) yield buffer.trim();
}
