import type { AIProvider, CompletionRequest, ExtractRequest } from "./types";

/**
 * Runs without any model. It answers by quoting the retrieved context, so the
 * retrieval pipeline and UI can be used and tested offline. It never pretends
 * to reason: the answer says it comes from offline mode.
 */
export class MockProvider implements AIProvider {
  readonly name = "mock" as const;
  readonly model = "offline";
  readonly isLanguageModel = false;

  async complete(req: CompletionRequest) {
    let text = "";
    for await (const chunk of this.stream(req)) text += chunk;
    return { text, stopReason: "end_turn" };
  }

  async *stream(req: CompletionRequest) {
    const memories = (req.context ?? []).filter((c) => c.kind === "memory");
    const entities = (req.context ?? []).filter((c) => c.kind === "entity");
    if (memories.length === 0) {
      yield "I couldn't find anything in your memory about that yet. Save a note, thesis or trade and ask again.";
      return;
    }
    const parts = [
      "Offline mode: no language model is configured, so here is what I found in your memory, most relevant first.\n\n",
      ...memories.slice(0, 5).map(
        (m) => `**${m.title}** [${m.ref}]\n${m.excerpt}\n\n`,
      ),
    ];
    if (entities.length) {
      parts.push(
        `Connected in your graph: ${entities
          .slice(0, 8)
          .map((e) => `${e.name} [${e.ref}]`)
          .join(", ")}.`,
      );
    }
    for (const part of parts) {
      for (const word of part.split(/(?<=\s)/)) yield word;
    }
  }

  async extract<T>(req: ExtractRequest<T>): Promise<T> {
    throw new Error(`Offline mode cannot extract ${req.schemaName}`);
  }
}
