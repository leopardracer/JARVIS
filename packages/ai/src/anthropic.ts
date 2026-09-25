import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { AIProvider, CompletionRequest, ExtractRequest } from "./types";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic" as const;
  readonly isLanguageModel = true;
  private client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string = DEFAULT_ANTHROPIC_MODEL,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(req: CompletionRequest) {
    const stream = this.client.beta.messages.stream(this.params(req));
    const message = await stream.finalMessage();
    const text = message.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("");
    return { text, stopReason: message.stop_reason };
  }

  async *stream(req: CompletionRequest) {
    const stream = this.client.beta.messages.stream(this.params(req));
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      yield "\n\nJARVIS could not answer this request.";
    }
  }

  async extract<T>(req: ExtractRequest<T>): Promise<T> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 8000,
      system: req.system,
      messages: [{ role: "user", content: req.prompt }],
      output_config: { format: zodOutputFormat(req.schema as never), effort: "low" },
    });
    if (response.parsed_output == null) {
      throw new Error(`Model returned no valid ${req.schemaName}`);
    }
    return req.schema.parse(response.parsed_output);
  }

  private params(req: CompletionRequest) {
    return {
      model: this.model,
      max_tokens: req.maxTokens ?? 16000,
      system: req.system,
      messages: req.messages,
      thinking: { type: "adaptive" as const },
      output_config: { effort: "medium" as const },
      // On a policy decline the API re-runs the request on a recommended model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default" as const,
    };
  }
}
