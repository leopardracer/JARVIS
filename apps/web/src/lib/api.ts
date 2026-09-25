import type { AskEvent } from "@jarvis/types";

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly issues?: Record<string, string[]>) {
    super(message);
  }
}

/** JSON fetch with API error bodies turned into ApiError. Dates arrive as ISO strings. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`, data.issues);
  }
  return data as T;
}

/** POST /api/ask and yield each NDJSON event as it arrives. */
export async function* ask(question: string, conversationId?: string, signal?: AbortSignal): AsyncGenerator<AskEvent> {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, conversationId }),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    yield { type: "error", message: data.error ?? "JARVIS could not answer right now." };
    return;
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) yield JSON.parse(line) as AskEvent;
    }
  }
}
