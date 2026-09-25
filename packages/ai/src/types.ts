import type { z } from "zod";
import type { ContextSource } from "@jarvis/types";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type CompletionRequest = {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  /**
   * The structured context the prompt was built from. Network providers read
   * it from the prompt text; the mock provider answers from it directly.
   */
  context?: ContextSource[];
};

export type CompletionResult = { text: string; stopReason: string | null };

export type ExtractRequest<T> = {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  schemaName: string;
};

export interface AIProvider {
  readonly name: "anthropic" | "openai" | "local" | "mock";
  readonly model: string;
  /** False for the mock provider; the UI shows an "offline mode" notice. */
  readonly isLanguageModel: boolean;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  stream(req: CompletionRequest): AsyncIterable<string>;
  extract<T>(req: ExtractRequest<T>): Promise<T>;
}

export interface EmbeddingProvider {
  readonly name: "openai" | "local" | "hash";
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export class ProviderConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigError";
  }
}
