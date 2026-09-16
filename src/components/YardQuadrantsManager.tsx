"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QUADRANT_COLORS, nextQuadrantColor, quadrantTextColor } from "@/lib/yard";
import type { YardQuadrant } from "@/lib/types";

// Add, rename, recolour and remove the buckets on a yard period.
//
// The API for this has existed since the first build; the screen never did.
// The board's own empty state told admins to come to the manage page and add
// quadrants here, and there was nothing here to do it with — so a period has
// been stuck with its four seeded buckets no matter what Craig wanted. This is
// what lets him add Toys, Scuba or Scooters.

export default function YardQuadrantsManager({
  periodId,
  quadrants,
}: {
  periodId: string;
  quadrants: YardQuadrant[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/yard-periods/${periodId}/quadrants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          color: nextQuadrantColor(quadrants.length),
          display_order: (quadrants.length + 1) * 10,
        }),
      });
      if (!res.ok) {
        setError("Couldn't add that bucket.");
        return;
      }
      setName("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function recolour(q: YardQuadrant, color: string) {
    setError(null);
    const res = await fetch(`/api/yard-periods/${periodId}/quadrants/${q.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    });
    if (res.ok) router.refresh();
    else setError("Couldn't change that colour.");
  }

  async function rename(q: YardQuadrant, next: string) {
    const trimmed = next.trim();
    if (!trimmed || trimmed === q.name) return;
    setError(null);
    const res = await fetch(`/api/yard-periods/${periodId}/quadrants/${q.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) router.refresh();
    else setError("Couldn't rename that bucket.");
  }

  async function remove(q: YardQuadrant) {
    setError(null);
    const res = await fetch(`/api/yard-periods/${periodId}/quadrants/${q.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      router.refresh();
      return;
    }
    // The database restricts deleting a bucket that still holds work, which is
    // the right answer — say what to do about it.
    setError(
      res.status === 409
        ? `"${q.name}" still has jobs in it. Move them to another bucket first.`
        : "Couldn't remove that bucket.",
    );
  }

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Buckets on this period</h2>
        <p className="text-xs text-slate-500">
          The columns on the board. New periods start with Exterior, Interior, Engineering and
          Freeman — add your own for anything else.
        </p>
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-100">
          {error}
        </p>
      )}

      <ul className="space-y-2">
        {quadrants.map((q) => (
          <li
            key={q.id}
            className="flex flex-wrap items-center gap-2 rounded-xl p-2 ring-1 ring-slate-200"
            style={{ backgroundColor: q.color }}
          >
            <input
              defaultValue={q.name}
              aria-label={`Name of the ${q.name} bucket`}
              onBlur={(e) => rename(q, e.target.value)}
              className="min-w-0 flex-1 rounded-lg bg-white/80 px-2 py-1 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-500"
              style={{ color: quadrantTextColor(q.color) }}
            />
            <div className="flex flex-wrap gap-1">
              {QUADRANT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => recolour(q, c)}
                  aria-label={`Use this colour for ${q.name}`}
                  aria-pressed={c === q.color}
                  className={`h-5 w-5 rounded-full ring-1 ring-slate-900/15 ${
                    c === q.color ? "ring-2 ring-slate-900/60" : ""
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => remove(q)}
              className="rounded-lg bg-white/80 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-white"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <label htmlFor="new-quadrant" className="sr-only">
          Name of the new bucket
        </label>
        <input
          id="new-quadrant"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Toys, Scuba, Scooters…"
          className="min-w-0 flex-1 rounded-xl px-3 py-2 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || !name.trim()}
          className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white active:bg-violet-700 disabled:opacity-50"
        >
          Add bucket
        </button>
      </div>
    </div>
  );
}
