"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Send, Sparkles, RefreshCw, AlertCircle } from "lucide-react";

function textOf(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function hasIntakeCompleteSignal(m: UIMessage): boolean {
  return m.parts.some(
    (p) =>
      (p as { type?: string }).type === "tool-signal_intake_complete" ||
      (p as { type?: string }).type === "tool-call" ||
      (p as { type?: string; toolName?: string }).toolName ===
        "signal_intake_complete"
  );
}

export function IntakeChat({
  planId,
  initialMessages,
}: {
  planId: string;
  initialMessages: UIMessage[];
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [pipelineStep, setPipelineStep] = useState<null | "extract" | "skeleton" | "candidates">(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const extracting = pipelineStep !== null;

  const seededGreeting: UIMessage[] =
    initialMessages.length === 0
      ? [
          {
            id: "intake-greeting",
            role: "assistant",
            parts: [
              {
                type: "text",
                text: "Hey — let's figure out this week. Before we get specific, what's the vibe? Heavy use-up week because the fridge is stacked, trying something new, or just surviving until Friday?",
              },
            ],
          },
        ]
      : [];

  const { messages, sendMessage, status } = useChat({
    messages: [...seededGreeting, ...initialMessages],
    transport: new DefaultChatTransport({
      api: `/api/plans/${planId}/intake/chat`,
    }),
  });

  const completed = messages.some(hasIntakeCompleteSignal);
  const busy = status === "streaming" || status === "submitted";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    const text = input;
    setInput("");
    await sendMessage({
      role: "user",
      parts: [{ type: "text", text }],
    });
  }

  async function runPipeline() {
    setError(null);
    const stages: Array<{
      key: "extract" | "skeleton" | "candidates";
      path: string;
    }> = [
      { key: "extract", path: `/api/plans/${planId}/intake/extract` },
      { key: "skeleton", path: `/api/plans/${planId}/skeleton` },
      { key: "candidates", path: `/api/plans/${planId}/candidates` },
    ];
    for (const stage of stages) {
      setPipelineStep(stage.key);
      try {
        const r = await fetch(stage.path, { method: "POST" });
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? r.statusText);
        }
      } catch (e) {
        setError(
          `${stage.key} failed — ${e instanceof Error ? e.message : "unknown"}`
        );
        setPipelineStep(null);
        return;
      }
    }
    router.push(`/plan/${planId}`);
  }

  const stageLabel: Record<NonNullable<typeof pipelineStep>, string> = {
    extract: "Saving your answers…",
    skeleton: "Drafting the week's thesis…",
    candidates: "Proposing meals for each slot…",
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-[50vh] flex-col gap-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        {messages
          .filter((m) => textOf(m))
          .map((m) => (
            <Bubble key={m.id} role={m.role}>
              {textOf(m)}
            </Bubble>
          ))}
        {busy && messages.length > 0 && (
          <Bubble role="assistant" dim>
            <span className="inline-flex items-center gap-1.5 text-stone-400">
              <RefreshCw className="h-3 w-3 animate-spin" />
              thinking…
            </span>
          </Bubble>
        )}
        <div ref={bottomRef} />
      </div>

      {completed ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <div className="flex items-start gap-2 text-sm text-stone-800">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <span>
              {pipelineStep
                ? stageLabel[pipelineStep]
                : "I've got enough. Ready to build the menu?"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runPipeline}
              disabled={extracting}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-800 disabled:opacity-60"
            >
              {extracting && <RefreshCw className="h-3 w-3 animate-spin" />}
              {extracting ? "Building…" : "Build my menu"}
            </button>
            {!extracting && (
              <button
                type="button"
                onClick={() => {
                  void sendMessage({
                    role: "user",
                    parts: [
                      {
                        type: "text",
                        text: "Actually, one more thing —",
                      },
                    ],
                  });
                }}
                className="text-sm font-medium text-stone-700 hover:text-stone-900"
              >
                Keep chatting
              </button>
            )}
            {error && (
              <span className="inline-flex items-center gap-1 text-xs text-rose-700">
                <AlertCircle className="h-3 w-3" />
                {error}
              </span>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder={
              messages.length === 0
                ? "Starting the conversation…"
                : "Type a reply…"
            }
            className="flex-1 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-stone-500 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-stone-900 text-white transition hover:bg-stone-800 disabled:opacity-50"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      )}
    </div>
  );
}

function Bubble({
  role,
  dim = false,
  children,
}: {
  role: "user" | "assistant" | "system" | "data";
  dim?: boolean;
  children: React.ReactNode;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? "bg-stone-900 text-white"
            : dim
            ? "bg-stone-50 text-stone-500"
            : "bg-stone-100 text-stone-900"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
