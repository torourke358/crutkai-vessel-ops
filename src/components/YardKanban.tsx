"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { YardQuadrant, YardTask, YardTaskStatus } from "@/lib/types";
import { QUADRANT_COLORS, nextQuadrantColor } from "@/lib/yard";

export interface YardKanbanQuadrant extends YardQuadrant {
  tasks: YardKanbanTask[];
}

export interface YardKanbanTask
  extends Pick<
    YardTask,
    | "id"
    | "title"
    | "status"
    | "progress_pct"
    | "effort"
    | "due_date"
    | "actual_cost"
    | "owner_id"
  > {
  ownerName?: string | null;
}

const STATUSES: { value: YardTaskStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

const STATUS_BADGE: Record<YardTaskStatus, string> = {
  todo: "bg-slate-100 text-slate-700",
  in_progress: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-800",
};

export default function YardKanban({
  periodId,
  quadrants,
  isAdmin,
}: {
  periodId: string;
  quadrants: YardKanbanQuadrant[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(
    nextQuadrantColor(quadrants.length),
  );
  const [savingStatus, setSavingStatus] = useState<string | null>(null);

  async function addQuadrant() {
    if (!newName.trim()) return;
    const res = await fetch(`/api/yard-periods/${periodId}/quadrants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        color: newColor,
        display_order: quadrants.length * 10,
      }),
    });
    if (!res.ok) {
      alert("Couldn't create quadrant.");
      return;
    }
    setNewName("");
    setNewColor(nextQuadrantColor(quadrants.length + 1));
    setCreating(false);
    router.refresh();
  }

  async function changeStatus(taskId: string, status: YardTaskStatus) {
    setSavingStatus(taskId);
    await fetch(`/api/yard-periods/${periodId}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setSavingStatus(null);
    router.refresh();
  }

  if (quadrants.length === 0) {
    return (
      <div className="space-y-3 rounded-2xl bg-white p-6 text-center ring-1 ring-slate-100">
        <p className="text-sm text-slate-500">
          No quadrants yet. Add the first one to start grouping tasks.
        </p>
        {isAdmin ? (
          creating ? (
            <div className="mx-auto max-w-sm space-y-2">
              <div className="flex gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Quadrant name (e.g. Interior)"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <button
                  onClick={addQuadrant}
                  className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white"
                >
                  Add
                </button>
              </div>
              <QuadrantColorPicker value={newColor} onChange={setNewColor} />
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white"
            >
              + Add quadrant
            </button>
          )
        ) : (
          <p className="text-xs text-slate-400">Ask an admin to set up quadrants.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          {creating ? (
            <>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Quadrant name"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              />
              <QuadrantColorPicker value={newColor} onChange={setNewColor} />
              <button
                onClick={addQuadrant}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
                className="text-sm text-slate-500"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
            >
              + Quadrant
            </button>
          )}
          <Link
            href={`/yard/${periodId}/tasks/new`}
            className="ml-auto rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            + New task
          </Link>
        </div>
      )}

      <div className="grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
        {quadrants.map((q) => (
          <div
            key={q.id}
            className="rounded-2xl bg-white p-3 ring-1 ring-slate-100"
            style={{ borderTop: `4px solid ${q.color}` }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-semibold text-slate-900">{q.name}</p>
              <span className="text-xs text-slate-400">{q.tasks.length}</span>
            </div>
            <ul className="space-y-2">
              {q.tasks.map((t) => (
                <li key={t.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                  <Link href={`/yard/${periodId}/tasks/${t.id}`} className="block">
                    <p className="text-sm font-medium text-slate-900">{t.title}</p>
                    <p className="text-xs text-slate-400">
                      {t.effort && <span>{t.effort}</span>}
                      {t.due_date && <span> · due {t.due_date}</span>}
                      {t.actual_cost != null && (
                        <span> · ${t.actual_cost.toFixed(2)}</span>
                      )}
                    </p>
                    {t.progress_pct > 0 && t.progress_pct < 100 && (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full bg-violet-500"
                          style={{ width: `${t.progress_pct}%` }}
                        />
                      </div>
                    )}
                  </Link>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <select
                      value={t.status}
                      onChange={(e) => changeStatus(t.id, e.target.value as YardTaskStatus)}
                      disabled={savingStatus === t.id}
                      className={`rounded-md border border-slate-200 px-2 py-1 text-xs font-medium ${STATUS_BADGE[t.status]}`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              ))}
              {q.tasks.length === 0 && (
                <li className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">
                  No tasks here yet.
                </li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuadrantColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {QUADRANT_COLORS.map((c) => {
        const selected = c === value;
        return (
          <button
            type="button"
            key={c}
            onClick={() => onChange(c)}
            aria-label={`Color ${c}`}
            className={`h-6 w-6 rounded-full ring-2 transition-shadow ${
              selected ? "ring-slate-700" : "ring-transparent hover:ring-slate-300"
            }`}
            style={{ backgroundColor: c }}
          />
        );
      })}
    </div>
  );
}
