"use client";

import { useRef, useState } from "react";
import type { ChatMessage } from "@/lib/jarvis";

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || pending) return;

    const history: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setPending(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        setMessages([...history, { role: "assistant", content: reply }]);
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    } catch {
      setError("JARVIS is unavailable right now. Try again in a moment.");
      setMessages(history);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6">
      <div className="flex flex-1 flex-col gap-4 pb-4">
        {messages.length === 0 && (
          <p className="mt-16 text-center text-muted">
            Ask JARVIS anything, for example: &ldquo;What is Robinhood
            Chain?&rdquo;
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "self-end rounded-none bg-brand px-4 py-2 text-brand-foreground"
                : "self-start whitespace-pre-wrap rounded-none border border-hairline bg-surface px-4 py-2"
            }
          >
            {m.content || (pending ? "…" : "")}
          </div>
        ))}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={send}
        className="sticky bottom-0 flex gap-2 bg-background py-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message JARVIS"
          className="flex-1 rounded-none border border-hairline bg-background px-4 py-2.5 outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="rounded-none bg-brand px-5 py-2.5 font-semibold text-brand-foreground disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
