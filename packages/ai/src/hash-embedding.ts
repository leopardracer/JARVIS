import type { EmbeddingProvider } from "./types";

const STOPWORDS = new Set(
  "a an and are as at be but by for from has have i in is it its my of on or so that the this to was we were will with you your me our about into than then there their they them what why how when which who".split(
    " ",
  ),
);

// Finance vocabulary that should land close together without a real model.
const ALIASES: Record<string, string> = {
  nvidia: "nvda",
  "advanced micro devices": "amd",
  ethereum: "eth",
  ether: "eth",
  bitcoin: "btc",
  microsoft: "msft",
  datacenter: "data center",
  datacenters: "data center",
  gpus: "gpu",
  chips: "semiconductor",
  chip: "semiconductor",
  semiconductors: "semiconductor",
  "artificial intelligence": "ai",
};

export function tokenize(text: string): string[] {
  let t = ` ${text.toLowerCase()} `;
  for (const [from, to] of Object.entries(ALIASES)) {
    t = t.replaceAll(` ${from} `, ` ${to} `);
  }
  return (t.match(/[\p{Letter}\p{Number}$]+/gu) ?? [])
    .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w))
    .map((w) => ALIASES[w] ?? w)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

function fnv1a(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic feature-hashing embeddings (unigrams + bigrams). Needs no
 * network or model and keeps semantic search working in development. Quality
 * is well below a trained embedding model; configure EMBEDDING_PROVIDER for
 * production.
 */
export class HashEmbeddingProvider implements EmbeddingProvider {
  readonly name = "hash" as const;
  readonly model = "jarvis-hash-v1";

  constructor(readonly dimensions: number = 1536) {}

  async embed(texts: string[]) {
    return texts.map((text) => this.embedOne(text));
  }

  embedOne(text: string): number[] {
    const v = new Array<number>(this.dimensions).fill(0);
    const tokens = tokenize(text);
    const features = [...tokens, ...tokens.slice(1).map((t, i) => `${tokens[i]}_${t}`)];
    for (const f of features) {
      const h = fnv1a(f);
      const weight = f.includes("_") ? 0.5 : 1;
      v[h % this.dimensions] += (h & 0x80000000 ? -1 : 1) * weight;
    }
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => x / norm);
  }
}
