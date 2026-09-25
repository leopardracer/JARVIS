import { describe, expect, it } from "vitest";
import { credentialsSchema, createMemorySchema, searchQuerySchema } from "@jarvis/types";
import { hashPassword, verifyPassword } from "./password";

describe("passwords", () => {
  it("hashes with a random salt and verifies", async () => {
    const a = await hashPassword("correct horse battery");
    const b = await hashPassword("correct horse battery");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", a)).toBe(true);
    expect(await verifyPassword("wrong password!!", a)).toBe(false);
    expect(await verifyPassword("anything at all", "garbage")).toBe(false);
  });
});

describe("API validation", () => {
  it("rejects short passwords and normalises emails", () => {
    expect(credentialsSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(false);
    expect(credentialsSchema.parse({ email: "Me@Example.COM", password: "long enough pw" }).email).toBe("me@example.com");
  });

  it("requires memory content and cleans tags", () => {
    expect(createMemorySchema.safeParse({ title: "x", content: "  " }).success).toBe(false);
    expect(createMemorySchema.parse({ title: "t", content: "c", tags: ["#AI"] })).toMatchObject({ type: "note", tags: ["ai"], source: "manual" });
    expect(createMemorySchema.safeParse({ title: "t", content: "c", sourceUrl: "not a url" }).success).toBe(false);
  });

  it("bounds search queries", () => {
    expect(searchQuerySchema.safeParse({ q: "" }).success).toBe(false);
    expect(searchQuerySchema.parse({ q: "nvda" })).toMatchObject({ mode: "hybrid", limit: 12 });
    expect(searchQuerySchema.safeParse({ q: "x", mode: "magic" }).success).toBe(false);
  });
});
