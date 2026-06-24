"use client";

import { useState } from "react";

// Ask-the-vessel chat: a question goes to /api/yard/ask, which searches the
// vessel's own yard / maintenance / inventory records and has Claude narrate
// the dates and costs (e.g. "when was the last time I used varnish?").
const SUGGESTIONS = [
  "When did I last use varnish?",
  "What's the serial on the main engine?",
  "Any open defects?",
  "When did I last run the engine-room checklist?",
];

export default function YardAssistant() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  async function ask(q: string) {
    const query = q.trim();
    if (!query || busy) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/yard/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail ?? data.error ?? "Something went wrong.");
        return;
      }
      setAnswer(data.answer);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white ring-1 ring-slate-100">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-100 text-sm font-bold text-violet-700">
            ✦
          </span>
          <span className="font-semibold text-slate-900">Ask about the boat</span>
        </span>
        <span className="text-xs text-slate-400">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="space-y-3 px-4 pb-4">
          <p className="text-sm text-slate-500">
            Ask about past work, costs, purchases, equipment, defects, or checklist history — e.g.
            when you last used a product and what it cost.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(question);
            }}
            className="flex gap-2"
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="When was the last time I used varnish?"
              className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-200 focus:ring-violet-400"
            />
            <button
              type="submit"
              disabled={busy || !question.trim()}
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white active:bg-violet-700 disabled:opacity-50"
            >
              {busy ? "…" : "Ask"}
            </button>
          </form>

          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setQuestion(s);
                  void ask(s);
                }}
                disabled={busy}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>

          {error && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-100">
              {error}
            </p>
          )}
          {answer && (
            <div className="whitespace-pre-wrap rounded-xl bg-slate-50 px-3 py-3 text-sm leading-relaxed text-slate-800 ring-1 ring-slate-100">
              {answer}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
