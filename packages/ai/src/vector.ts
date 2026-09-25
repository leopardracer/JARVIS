/** Zero-pad a vector to the storage width. Cosine similarity is unchanged by zero padding. */
export function padVector(v: number[], width: number): number[] {
  if (v.length > width) {
    throw new Error(`Embedding has ${v.length} dimensions; the maximum is ${width}`);
  }
  return v.length === width ? v : [...v, ...new Array<number>(width - v.length).fill(0)];
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
