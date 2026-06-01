"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  UserProfile,
  YardTask,
  YardTaskComment,
  YardTaskDocument,
  YardTaskEffort,
  YardTaskUrgency,
} from "@/lib/types";
import { YARD_TASK_URGENCY_LABELS } from "@/lib/types";
import OwnerWheel from "@/components/wheels/OwnerWheel";
import ProgressWheel from "@/components/wheels/ProgressWheel";
import EffortWheel from "@/components/wheels/EffortWheel";
import ReminderWheel from "@/components/wheels/ReminderWheel";
import YardTaskAttachments from "@/components/YardTaskAttachments";
import YardTaskComments from "@/components/YardTaskComments";

// Auto-saving detail panel. Every change debounces and PATCHes the task.
export default function YardTaskDetailPanel({
  task,
  periodId,
  users,
  comments = [],
  documents = [],
  onDeleted,
}: {
  task: YardTask;
  periodId: string;
  users: Pick<UserProfile, "id" | "full_name">[];
  comments?: YardTaskComment[];
  documents?: YardTaskDocument[];
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<YardTask>(task);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const debounceRef = useRef<number | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  // Whenever the task prop changes (selection changes), reset the draft.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setDraft(task);
    setSavedAt(null);
  }, [task]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function update<K extends keyof YardTask>(key: K, val: YardTask[K]) {
    setDraft((d) => {
      const next = { ...d, [key]: val };
      queueSave(next);
      return next;
    });
  }

  function queueSave(next: YardTask) {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void save(next);
    }, 500);
  }

  async function save(next: YardTask) {
    // Serialize so we don't fire two requests in parallel for the same task.
    if (inFlight.current) await inFlight.current;
    setSaving(true);
    const p = (async () => {
      try {
        const res = await fetch(
          `/api/yard-periods/${periodId}/tasks/${next.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: next.title,
              description: next.description,
              owner_id: next.owner_id,
              progress_pct: next.progress_pct,
              effort: next.effort,
              due_date: next.due_date,
              reminder_date: next.reminder_date,
              resources: next.resources,
              status: next.status,
              urgency: next.urgency,
              follower_ids: next.follower_ids,
            }),
          },
        );
        if (res.ok) {
          setSavedAt(Date.now());
          router.refresh();
        }
      } finally {
        setSaving(false);
      }
    })();
    inFlight.current = p;
    await p;
    inFlight.current = null;
  }

  async function remove() {
    if (!confirm(`Delete "${draft.title}"?`)) return;
    await fetch(`/api/yard-periods/${periodId}/tasks/${draft.id}`, {
      method: "DELETE",
    });
    onDeleted?.();
    router.refresh();
  }

  return (
    <aside className="flex h-full flex-col gap-4 rounded-2xl bg-slate-900 p-5 text-slate-100">
      {/* Title */}
      <div>
        <input
          value={draft.title}
          onChange={(e) => update("title", e.target.value)}
          className="w-full rounded-lg bg-transparent text-xl font-semibold text-white outline-none focus:bg-slate-800 focus:px-2 focus:py-1"
        />
        <p className="mt-1 text-xs text-slate-400">
          {saving
            ? "Saving…"
            : savedAt
              ? `Saved ${new Date(savedAt).toLocaleTimeString()}`
              : "Edit any field — changes auto-save."}
        </p>
      </div>

      {/* Wheels row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Owner">
          <OwnerWheel
            ownerId={draft.owner_id}
            users={users}
            onChange={(next) => update("owner_id", next)}
          />
        </Field>
        <Field label="Progress">
          <ProgressWheel
            value={draft.progress_pct}
            onChange={(next) => update("progress_pct", next)}
          />
        </Field>
        <Field label="Effort">
          <EffortWheel
            value={draft.effort}
            onChange={(next: YardTaskEffort | null) => update("effort", next)}
          />
        </Field>
        <Field label="Reminder">
          <ReminderWheel
            value={draft.reminder_date}
            onChange={(next) => update("reminder_date", next)}
          />
        </Field>
      </div>

      {/* Urgency + followers */}
      <div className="rounded-xl bg-slate-800 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Urgency &amp; followers
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-slate-400">Urgency</label>
            <select
              value={draft.urgency ?? ""}
              onChange={(e) =>
                update("urgency", (e.target.value || null) as YardTaskUrgency | null)
              }
              className="mt-1 block w-full rounded-md bg-slate-900 px-2 py-1 text-sm text-slate-100"
            >
              <option value="">(unset)</option>
              {(Object.entries(YARD_TASK_URGENCY_LABELS) as [
                YardTaskUrgency,
                string,
              ][]).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400">
              Followers ({draft.follower_ids.length})
            </label>
            <select
              multiple
              value={draft.follower_ids}
              onChange={(e) => {
                const next = Array.from(e.target.selectedOptions, (o) => o.value);
                update("follower_ids", next);
              }}
              className="mt-1 block h-20 w-full rounded-md bg-slate-900 px-2 py-1 text-xs text-slate-100"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name ?? u.id}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Dates row — no wheel */}
      <div className="rounded-xl bg-slate-800 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Dates
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-slate-400">Due</label>
            <input
              type="date"
              value={draft.due_date ?? ""}
              onChange={(e) => update("due_date", e.target.value || null)}
              className="mt-1 block w-full rounded-md bg-slate-900 px-2 py-1 text-sm text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400">
              Status
            </label>
            <select
              value={draft.status}
              onChange={(e) =>
                update("status", e.target.value as YardTask["status"])
              }
              className="mt-1 block w-full rounded-md bg-slate-900 px-2 py-1 text-sm text-slate-100"
            >
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Notes
        </label>
        <textarea
          rows={3}
          value={draft.description ?? ""}
          onChange={(e) => update("description", e.target.value || null)}
          placeholder="Things to remember about this task…"
          className="mt-1 block w-full rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      {/* Resources */}
      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Resources
        </label>
        <textarea
          rows={3}
          value={draft.resources ?? ""}
          onChange={(e) => update("resources", e.target.value || null)}
          placeholder="Vendor contacts, manuals, links…"
          className="mt-1 block w-full rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      {/* Attachments */}
      <YardTaskAttachments yardTaskId={draft.id} initial={documents} />

      {/* Comments */}
      <YardTaskComments
        yardTaskId={draft.id}
        initial={comments}
        users={users}
      />

      {/* Delete */}
      <button
        onClick={remove}
        className="mt-auto rounded-lg border border-rose-500/40 px-3 py-2 text-sm font-medium text-rose-300 hover:bg-rose-500/10"
      >
        Delete task
      </button>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-slate-800 p-3">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </span>
      {children}
    </div>
  );
}
