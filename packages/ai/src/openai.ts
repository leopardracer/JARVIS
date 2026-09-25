import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { AIProvider, CompletionRequest, EmbeddingProvider, ExtractRequest } from "./types";

export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;
  readonly isLanguageModel = true;
  private client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string,
    baseURL?: string,
  ) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async complete(req: CompletionRequest) {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: this.messages(req),
      max_completion_tokens: req.maxTokens ?? 16000,
    });
    const choice = res.choices[0];
    return { text: choice?.message.content ?? "", stopReason: choice?.finish_reason ?? null };
  }

  async *stream(req: CompletionRequest) {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: this.messages(req),
      max_completion_tokens: req.maxTokens ?? 16000,
      stream: true,
    });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
  }

  async extract<T>(req: ExtractRequest<T>): Promise<T> {
    const res = await this.client.chat.completions.parse({
      model: this.model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.prompt },
      ],
      response_format: zodResponseFormat(req.schema as never, req.schemaName),
    });
    const parsed = res.choices[0]?.message.parsed;
    if (parsed == null) throw new Error(`Model returned no valid ${req.schemaName}`);
    return req.schema.parse(parsed);
  }

  private messages(req: CompletionRequest) {
    return [
      { role: "system" as const, content: req.system },
      ...req.messages.map((m) => ({ role: m.role, content: m.content })),
    ];
  }
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = "openai" as const;
  private client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string = "text-embedding-3-small",
    readonly dimensions: number = 1536,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async embed(texts: string[]) {
    if (texts.length === 0) return [];
    const res = await this.client.embeddings.create({
      model: this.model,
      input: texts,
      dimensions: this.dimensions,
    });
    return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}
