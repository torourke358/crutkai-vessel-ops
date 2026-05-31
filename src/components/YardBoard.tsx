"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { UserProfile, YardQuadrant, YardTask } from "@/lib/types";
import YardTaskDetailPanel from "@/components/YardTaskDetailPanel";

export interface BoardQuadrant extends YardQuadrant {
  tasks: YardTask[];
}

export default function YardBoard({
  periodId,
  quadrants,
  users,
  isAdmin,
}: {
  periodId: string;
  quadrants: BoardQuadrant[];
  users: Pick<UserProfile, "id" | "full_name">[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  // `quadrants` comes straight from props. router.refresh() re-renders the
  // server component, which passes the new task list down — caching in
  // useState would freeze the board at first-render data and cause adds
  // to silently disappear until a full page reload.
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => {
    // Pre-select the first task on first render if any exist.
    for (const q of quadrants) {
      if (q.tasks.length > 0) return q.tasks[0].id;
    }
    return null;
  });

  // Pull the live task object out of quadrants on every render so edits
  // round-trip via router.refresh() and the local state stays consistent.
  const selectedTask: YardTask | null =
    selectedTaskId == null
      ? null
      : quadrants
          .flatMap((q) => q.tasks)
          .find((t) => t.id === selectedTaskId) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      {/* Left: 2x2 quadrant board */}
      <div className="grid gap-3 sm:grid-cols-2">
        {quadrants.length === 0 ? (
          <div className="col-span-full rounded-2xl bg-white p-6 text-center text-sm text-slate-400 ring-1 ring-slate-100">
            No quadrants yet for this yard period.
            {isAdmin && (
              <>
                {" "}New periods auto-get Exterior / Interior / Engineering /
                Freeman. For this one, add quadrants on the{" "}
                <Link
                  href={`/yard/${periodId}/manage`}
                  className="font-medium text-violet-700"
                >
                  manage page
                </Link>
                .
              </>
            )}
          </div>
        ) : (
          quadrants.map((q) => (
            <QuadrantColumn
              key={q.id}
              periodId={periodId}
              quadrant={q}
              selectedId={selectedTaskId}
              onSelect={(id) => setSelectedTaskId(id)}
              onAdded={() => router.refresh()}
            />
          ))
        )}
      </div>

      {/* Right: task detail panel */}
      <div className="hidden min-h-[600px] lg:block">
        {selectedTask ? (
          <YardTaskDetailPanel
            task={selectedTask}
            periodId={periodId}
            users={users}
            onDeleted={() => setSelectedTaskId(null)}
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl bg-slate-900 p-6 text-center text-sm text-slate-400">
            Select a task on the left to see its details here.
          </div>
        )}
      </div>

      {/* Mobile: stacked detail under the board */}
      <div className="lg:hidden">
        {selectedTask ? (
          <YardTaskDetailPanel
            task={selectedTask}
            periodId={periodId}
            users={users}
            onDeleted={() => setSelectedTaskId(null)}
          />
        ) : (
          <p className="rounded-2xl bg-slate-100 p-4 text-center text-sm text-slate-500">
            Tap a task above to edit it.
          </p>
        )}
      </div>
    </div>
  );
}

function QuadrantColumn({
  periodId,
  quadrant,
  selectedId,
  onSelect,
  onAdded,
}: {
  periodId: string;
  quadrant: BoardQuadrant;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdded: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!newTitle.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/yard-periods/${periodId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quadrant_id: quadrant.id,
        title: newTitle.trim(),
        status: "todo",
        progress_pct: 0,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      alert("Couldn't add task.");
      return;
    }
    setNewTitle("");
    setAdding(false);
    onAdded();
  }

  return (
    <section
      className="flex min-h-[260px] flex-col rounded-2xl bg-white shadow-sm ring-1 ring-slate-100"
      style={{ borderTop: `6px solid ${quadrant.color}` }}
    >
      <header className="flex items-center justify-between px-4 pt-3">
        <h2 className="text-base font-semibold text-slate-900">
          {quadrant.name}
        </h2>
        <span className="text-xs text-slate-400">
          {quadrant.tasks.length}
        </span>
      </header>

      <ul className="flex-1 space-y-1 px-2 py-2">
        {quadrant.tasks.length === 0 && !adding && (
          <li className="px-2 py-1 text-xs text-slate-400">
            No items yet.
          </li>
        )}
        {quadrant.tasks.map((t) => {
          const selected = t.id === selectedId;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                style={selected ? undefined : { color: quadrant.color }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selected
                    ? "bg-violet-50 text-violet-900 ring-1 ring-violet-200"
                    : "hover:bg-slate-50"
                }`}
              >
                <span className="flex-1 truncate">
                  {t.status === "done" && (
                    <span className="mr-1 text-emerald-600">✓</span>
                  )}
                  <span className={t.status === "done" ? "line-through opacity-60" : ""}>
                    {t.title}
                  </span>
                </span>
                {t.progress_pct > 0 && t.progress_pct < 100 && (
                  <span className="shrink-0 text-xs text-slate-400 tabular-nums">
                    {t.progress_pct}%
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="border-t border-slate-100 px-2 py-2">
        {adding ? (
          <div className="space-y-1">
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
                if (e.key === "Escape") {
                  setAdding(false);
                  setNewTitle("");
                }
              }}
              placeholder="Item title…"
              className="block w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
            <div className="flex items-center gap-1">
              <button
                onClick={add}
                disabled={saving || !newTitle.trim()}
                className="rounded-md bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Add"}
              </button>
              <button
                onClick={() => {
                  setAdding(false);
                  setNewTitle("");
                }}
                className="rounded-md px-2 py-1 text-xs text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="block w-full rounded-md px-3 py-1.5 text-left text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-violet-700"
          >
            + Add item
          </button>
        )}
      </footer>
    </section>
  );
}
