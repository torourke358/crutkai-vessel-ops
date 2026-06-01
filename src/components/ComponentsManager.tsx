"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Component } from "@/lib/types";

// Admin-only editor for the systems / components lookup. Supports rename,
// activate / deactivate, reorder (move up / move down), and add new. The
// list is the source of truth for the System dropdown on equipment and
// the Related components picker on inventory.
export default function ComponentsManager({ initial }: { initial: Component[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Component[]>(initial);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setDraft(id: string, value: string) {
    setDrafts((prev) => ({ ...prev, [id]: value }));
  }

  async function patch(id: string, body: Partial<Component>) {
    setError(null);
    const res = await fetch(`/api/components/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError("Save failed.");
      return null;
    }
    const next = (await res.json()) as Component;
    setRows((prev) =>
      prev
        .map((r) => (r.id === id ? next : r))
        .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name)),
    );
    return next;
  }

  async function rename(id: string) {
    const current = rows.find((r) => r.id === id);
    const next = drafts[id];
    if (!current || next == null || next.trim() === "" || next === current.name) {
      setDrafts((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      return;
    }
    await patch(id, { name: next.trim() } as Partial<Component>);
    setDrafts((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    router.refresh();
  }

  async function toggleActive(c: Component) {
    await patch(c.id, { active: !c.active } as Partial<Component>);
    router.refresh();
  }

  async function move(c: Component, dir: -1 | 1) {
    const sorted = [...rows].sort(
      (a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name),
    );
    const idx = sorted.findIndex((r) => r.id === c.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    // Swap display_order values. PATCH each in turn; the API logs both.
    await patch(c.id, { display_order: other.display_order });
    await patch(other.id, { display_order: c.display_order });
    router.refresh();
  }

  async function add() {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/components", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't add that system.");
      return;
    }
    const created = (await res.json()) as Component;
    setRows((prev) =>
      prev.some((r) => r.id === created.id)
        ? prev
        : [...prev, created].sort(
            (a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name),
          ),
    );
    setNewName("");
    router.refresh();
  }

  const sorted = [...rows].sort(
    (a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name),
  );

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>
      )}

      <div className="flex gap-2 rounded-2xl bg-white p-3 ring-1 ring-slate-100">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
          placeholder="Add a new system…"
          className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy || !newName.trim()}
          className="rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </div>

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
        {sorted.length === 0 ? (
          <li className="p-4 text-center text-sm text-slate-400">No systems yet.</li>
        ) : (
          sorted.map((c, i) => {
            const draft = drafts[c.id];
            return (
              <li key={c.id} className="flex items-center gap-2 p-3">
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => void move(c, -1)}
                    disabled={i === 0}
                    className="text-xs text-slate-400 hover:text-violet-700 disabled:opacity-40"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => void move(c, 1)}
                    disabled={i === sorted.length - 1}
                    className="text-xs text-slate-400 hover:text-violet-700 disabled:opacity-40"
                  >
                    ▼
                  </button>
                </div>

                <input
                  type="text"
                  value={draft ?? c.name}
                  onChange={(e) => setDraft(c.id, e.target.value)}
                  onBlur={() => void rename(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                  }}
                  className={`flex-1 rounded-md border border-transparent px-2 py-1.5 text-sm hover:border-slate-200 focus:border-violet-400 focus:bg-white focus:outline-none ${
                    c.active ? "text-slate-900" : "text-slate-400 line-through"
                  }`}
                />

                <span className="w-12 text-right text-xs tabular-nums text-slate-400">
                  {c.display_order}
                </span>

                <button
                  type="button"
                  onClick={() => void toggleActive(c)}
                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                    c.active
                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {c.active ? "Active" : "Inactive"}
                </button>
              </li>
            );
          })
        )}
      </ul>

      <p className="text-xs text-slate-400">
        Deactivate rather than delete to keep historical inventory + equipment
        rows valid. Inactive systems disappear from pickers but stay on records
        already using them.
      </p>
    </div>
  );
}
