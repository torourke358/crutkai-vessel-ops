"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";

export interface CommentItem {
  id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

// Generic comments thread. Takes a POST URL, an initial list, and a map of
// user_id → name so author labels render without an extra fetch. Used by
// yard tasks and defects.
export default function CommentsThread({
  postUrl,
  initial,
  nameById,
}: {
  postUrl: string;
  initial: CommentItem[];
  nameById: Map<string, string>;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    const res = await fetch(postUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: trimmed }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Comment failed.");
      return;
    }
    const row = (await res.json()) as CommentItem;
    setItems((prev) => [...prev, row]);
    setBody("");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
        {items.length === 0 ? (
          <li className="p-4 text-center text-sm text-slate-400">
            No comments yet.
          </li>
        ) : (
          items.map((c) => (
            <li key={c.id} className="space-y-1 p-3">
              <p className="whitespace-pre-wrap text-sm text-slate-700">
                {c.body}
              </p>
              <p className="text-xs text-slate-400">
                {c.author_id ? nameById.get(c.author_id) ?? "Unknown" : "—"} ·{" "}
                {formatDate(c.created_at.slice(0, 10))}
              </p>
            </li>
          ))
        )}
      </ul>
      <div className="flex gap-2 rounded-2xl bg-white p-2 ring-1 ring-slate-100">
        <textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          className="flex-1 resize-none rounded-md border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || !body.trim()}
          className="rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {busy ? "Posting…" : "Post"}
        </button>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
