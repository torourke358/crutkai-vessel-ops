"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";
import type { UserProfile, YardTaskComment } from "@/lib/types";

// Dark-themed comments thread, sibling of CommentsThread but adapted to the
// slate-900 detail panel so it fits in visually.
export default function YardTaskComments({
  yardTaskId,
  initial,
  users,
}: {
  yardTaskId: string;
  initial: YardTaskComment[];
  users: Pick<UserProfile, "id" | "full_name">[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const nameById = new Map(
    users.map((u) => [u.id, u.full_name ?? "Unknown"] as const),
  );

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setBusy(true);
    const res = await fetch(`/api/yard-tasks/${yardTaskId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: trimmed }),
    });
    setBusy(false);
    if (!res.ok) return;
    const row = (await res.json()) as YardTaskComment;
    setItems((prev) => [...prev, row]);
    setBody("");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        Comments ({items.length})
      </p>
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((c) => (
            <li key={c.id} className="rounded-md bg-slate-800 px-2 py-1.5">
              <p className="whitespace-pre-wrap text-xs text-slate-100">
                {c.body}
              </p>
              <p className="text-[10px] text-slate-400">
                {c.author_id ? nameById.get(c.author_id) ?? "Unknown" : "—"} ·{" "}
                {formatDate(c.created_at.slice(0, 10))}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1">
        <textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          className="flex-1 resize-none rounded-md bg-slate-800 px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:ring-1 focus:ring-violet-500"
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || !body.trim()}
          className="rounded-md bg-violet-600 px-2 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-60"
        >
          Post
        </button>
      </div>
    </div>
  );
}
