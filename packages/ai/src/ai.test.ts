import { describe, expect, it } from "vitest";
import { createAIProvider, createEmbeddingProvider } from "./factory";
import { HashEmbeddingProvider } from "./hash-embedding";
import { MockProvider } from "./mock";
import { ProviderConfigError } from "./types";
import { cosine, padVector } from "./vector";

describe("provider factory", () => {
  it("falls back to offline providers without keys", () => {
    expect(createAIProvider({}).name).toBe("mock");
    expect(createEmbeddingProvider({}).name).toBe("hash");
  });

  it("picks Anthropic when its key is present", () => {
    const p = createAIProvider({ ANTHROPIC_API_KEY: "test" });
    expect(p.name).toBe("anthropic");
    expect(p.model).toBe("claude-opus-5");
  });

  it("requires a model name for OpenAI chat", () => {
    expect(() => createAIProvider({ AI_PROVIDER: "openai", OPENAI_API_KEY: "k" })).toThrow(
      ProviderConfigError,
    );
  });

  it("rejects unknown providers", () => {
    expect(() => createAIProvider({ AI_PROVIDER: "nope" })).toThrow(/Unknown AI_PROVIDER/);
  });
});

describe("hash embeddings", () => {
  const e = new HashEmbeddingProvider();

  it("are deterministic and normalised", () => {
    const [a] = [e.embedOne("NVIDIA data centers")];
    expect(e.embedOne("NVIDIA data centers")).toEqual(a);
    expect(Math.hypot(...a)).toBeCloseTo(1, 5);
  });

  it("place related finance text closer than unrelated text", () => {
    const q = e.embedOne("nvidia gpu demand");
    const related = e.embedOne("NVDA sells GPUs into data centers; demand keeps growing");
    const unrelated = e.embedOne("Bitcoin halving and miner revenue");
    expect(cosine(q, related)).toBeGreaterThan(cosine(q, unrelated));
  });
});

describe("padVector", () => {
  it("keeps cosine similarity", () => {
    const a = [1, 2, 3];
    const b = [3, 2, 1];
    expect(cosine(padVector(a, 8), padVector(b, 8))).toBeCloseTo(cosine(a, b));
  });

  it("rejects vectors that are too wide", () => {
    expect(() => padVector([1, 2, 3], 2)).toThrow();
  });
});

describe("mock provider", () => {
  it("answers only from the given context and cites refs", async () => {
    const p = new MockProvider();
    const { text } = await p.complete({
      system: "",
      messages: [{ role: "user", content: "Why NVDA?" }],
      context: [
        {
          kind: "memory",
          ref: "M1",
          id: "1",
          title: "NVDA thesis",
          type: "thesis",
          excerpt: "AI infrastructure demand is accelerating.",
          createdAt: new Date().toISOString(),
          score: 1,
        },
      ],
    });
    expect(text).toContain("[M1]");
    expect(text).toContain("Offline mode");
  });
});
