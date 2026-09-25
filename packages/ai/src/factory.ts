import { AnthropicProvider, DEFAULT_ANTHROPIC_MODEL } from "./anthropic";
import { HashEmbeddingProvider } from "./hash-embedding";
import { LocalEmbeddingProvider, LocalProvider } from "./local";
import { MockProvider } from "./mock";
import { OpenAIEmbeddingProvider, OpenAIProvider } from "./openai";
import { ProviderConfigError, type AIProvider, type EmbeddingProvider } from "./types";

type Env = Record<string, string | undefined>;

function required(env: Env, key: string, provider: string): string {
  const value = env[key];
  if (!value) throw new ProviderConfigError(`${key} is required when ${provider}`);
  return value;
}

/**
 * AI_PROVIDER = anthropic | openai | local | mock.
 * When unset, the first configured key wins (Anthropic, then OpenAI), else mock.
 */
export function createAIProvider(env: Env = process.env): AIProvider {
  const choice =
    env.AI_PROVIDER ||
    (env.ANTHROPIC_API_KEY ? "anthropic" : env.OPENAI_API_KEY ? "openai" : "mock");

  switch (choice) {
    case "anthropic":
      return new AnthropicProvider(
        required(env, "ANTHROPIC_API_KEY", "AI_PROVIDER=anthropic"),
        env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
      );
    case "openai":
      return new OpenAIProvider(
        required(env, "OPENAI_API_KEY", "AI_PROVIDER=openai"),
        required(env, "OPENAI_MODEL", "AI_PROVIDER=openai"),
        env.OPENAI_BASE_URL || undefined,
      );
    case "local":
      return new LocalProvider(
        env.LOCAL_AI_URL || "http://localhost:11434",
        required(env, "LOCAL_AI_MODEL", "AI_PROVIDER=local"),
      );
    case "mock":
      return new MockProvider();
    default:
      throw new ProviderConfigError(`Unknown AI_PROVIDER "${choice}"`);
  }
}

/** EMBEDDING_PROVIDER = openai | local | hash. Defaults to openai when OPENAI_API_KEY is set, else hash. */
export function createEmbeddingProvider(env: Env = process.env): EmbeddingProvider {
  const choice = env.EMBEDDING_PROVIDER || (env.OPENAI_API_KEY ? "openai" : "hash");
  switch (choice) {
    case "openai":
      return new OpenAIEmbeddingProvider(
        required(env, "OPENAI_API_KEY", "EMBEDDING_PROVIDER=openai"),
        env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
      );
    case "local":
      return new LocalEmbeddingProvider(
        env.LOCAL_AI_URL || "http://localhost:11434",
        required(env, "LOCAL_EMBEDDING_MODEL", "EMBEDDING_PROVIDER=local"),
        Number(env.LOCAL_EMBEDDING_DIMENSIONS || 768),
      );
    case "hash":
      return new HashEmbeddingProvider();
    default:
      throw new ProviderConfigError(`Unknown EMBEDDING_PROVIDER "${choice}"`);
  }
}
