import { z } from "zod";
import type { AIProvider } from "@jarvis/ai";
import { ENTITY_TYPES, RELATIONSHIP_TYPES, type EntityType, type RelationshipType } from "@jarvis/types";

export type ExtractedEntity = {
  type: EntityType;
  name: string;
  symbol?: string | null;
};

export type ExtractedRelation = {
  source: string; // entity name
  target: string;
  type: RelationshipType;
};

export type Extraction = { entities: ExtractedEntity[]; relations: ExtractedRelation[] };

const extractionSchema = z.object({
  entities: z
    .array(
      z.object({
        type: z.enum(ENTITY_TYPES),
        name: z.string().min(1).max(120),
        symbol: z.string().max(12).nullable(),
      }),
    )
    .max(25),
  relations: z
    .array(
      z.object({
        source: z.string(),
        target: z.string(),
        type: z.enum(RELATIONSHIP_TYPES),
      }),
    )
    .max(40),
});

const SYSTEM = `You extract a financial knowledge graph from a user's note.
Return the concrete entities it mentions: assets (with ticker symbol), companies, people, protocols, events and broad themes (for example "AI infrastructure", "semiconductors").
Return typed relations between those entities only when the note states or clearly implies them.
Use "supports" or "contradicts" only for evidence for or against a claim. Do not invent entities that are not in the text.`;

/** Cashtags ($NVDA) are always treated as asset symbols. */
export function ruleBasedExtraction(text: string): Extraction {
  const symbols = new Set<string>();
  for (const m of text.matchAll(/\$([A-Za-z]{1,6})\b/g)) symbols.add(m[1].toUpperCase());
  return {
    entities: [...symbols].map((symbol) => ({ type: "asset" as const, name: symbol, symbol })),
    relations: [],
  };
}

export async function llmExtraction(ai: AIProvider, title: string, content: string): Promise<Extraction> {
  if (!ai.isLanguageModel) return { entities: [], relations: [] };
  const result = await ai.extract({
    system: SYSTEM,
    prompt: `Title: ${title}\n\n${content.slice(0, 12_000)}`,
    schema: extractionSchema,
    schemaName: "extraction",
  });
  return {
    entities: result.entities.map((e) => ({ ...e, symbol: e.symbol || null })),
    relations: result.relations,
  };
}
