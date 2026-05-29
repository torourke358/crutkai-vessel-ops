"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  UserProfile,
  YardQuadrant,
  YardTask,
  YardTaskEffort,
  YardTaskStatus,
} from "@/lib/types";

interface PastCostItem {
  id: string;
  title: string;
  actual_cost: number;
  completed_at: string | null;
  period_name: string;
}

export default function YardTaskEditor({
  periodId,
  initial,
  quadrants,
  users,
}: {
  periodId: string;
  initial: YardTask | null;
  quadrants: YardQuadrant[];
  users: Pick<UserProfile, "id" | "full_name">[];
}) {
  const router = useRouter();
  const isEdit = initial != null;

  const [quadrantId, setQuadrantId] = useState(initial?.quadrant_id ?? quadrants[0]?.id ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [ownerId, setOwnerId] = useState(initial?.owner_id ?? "");
  const [progress, setProgress] = useState(initial?.progress_pct ?? 0);
  const [effort, setEffort] = useState<"" | YardTaskEffort>((initial?.effort ?? "") as "" | YardTaskEffort);
  const [dueDate, setDueDate] = useState(initial?.due_date ?? "");
  const [status, setStatus] = useState<YardTaskStatus>(initial?.status ?? "todo");
  const [cost, setCost] = useState(initial?.actual_cost != null ? String(initial.actual_cost) : "");

  const [pastCosts, setPastCosts] = useState<PastCostItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Look up past costs when title changes (300ms debounce).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const q = title.trim();
    if (q.length < 2) {
      setPastCosts([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/yard-tasks/past-costs?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const body = (await res.json()) as { items: PastCostItem[] };
        setPastCosts(body.items);
      } catch {
        // ignore
      }
    }, 300);
    return () => clearTimeout(t);
  }, [title]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function save() {
    if (!title.trim() || !quadrantId) {
      setError("Title and quadrant are required.");
      return;
    }
    setSaving(true);
    setError(null);

    const body = {
      quadrant_id: quadrantId,
      title: title.trim(),
      description: description.trim() || null,
      owner_id: ownerId || null,
      progress_pct: Number(progress) || 0,
      effort: effort || null,
      due_date: dueDate || null,
      status,
      actual_cost: cost === "" ? null : Number(cost),
    };

    const res = await fetch(
      isEdit
        ? `/api/yard-periods/${periodId}/tasks/${initial!.id}`
        : `/api/yard-periods/${periodId}/tasks`,
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    setSaving(false);
    if (!res.ok) {
      setError("Save failed.");
      return;
    }
    if (isEdit) {
      setMessage("Saved.");
      router.refresh();
    } else {
      router.push(`/yard/${periodId}`);
      router.refresh();
    }
  }

  async function remove() {
    if (!initial) return;
    if (!confirm(`Delete "${initial.title}"?`)) return;
    setDeleting(true);
    const res = await fetch(`/api/yard-periods/${periodId}/tasks/${initial.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError("Delete failed.");
      setDeleting(false);
      return;
    }
    router.push(`/yard/${periodId}`);
    router.refresh();
  }

  const inputClass =
    "mt-1 block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200";

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">
          {isEdit ? `Edit · ${initial.title}` : "New yard task"}
        </h1>
        <Link href={`/yard/${periodId}`} className="text-sm text-slate-500">
          Back
        </Link>
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {message && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}

      <div>
        <label className="block text-sm font-medium text-slate-700">Title *</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
      </div>

      {pastCosts.length > 0 && (
        <div className="rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-900">
          <p className="font-semibold">Last time we paid for something similar:</p>
          <ul className="mt-1 space-y-0.5">
            {pastCosts.map((p) => (
              <li key={p.id}>
                <span className="font-medium">${p.actual_cost.toFixed(2)}</span> ·{" "}
                {p.title} ({p.period_name})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">Quadrant *</label>
          <select
            value={quadrantId}
            onChange={(e) => setQuadrantId(e.target.value)}
            className={inputClass}
          >
            <option value="" disabled>
              Choose
            </option>
            {quadrants.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Owner</label>
          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className={inputClass}
          >
            <option value="">(unassigned)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name ?? u.id}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-slate-700">Effort</label>
          <select
            value={effort}
            onChange={(e) => setEffort(e.target.value as "" | YardTaskEffort)}
            className={inputClass}
          >
            <option value="">—</option>
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Due date</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as YardTaskStatus)}
            className={inputClass}
          >
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="done">Done</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">Progress %</label>
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={progress}
            onChange={(e) => setProgress(Math.max(0, Math.min(100, Number(e.target.value || 0))))}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Actual cost (USD)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Description</label>
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClass}
        />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
      >
        {saving ? "Saving…" : isEdit ? "Save changes" : "Create task"}
      </button>

      {isEdit && (
        <button
          onClick={remove}
          disabled={deleting}
          className="flex w-full items-center justify-center rounded-xl border border-rose-200 px-4 py-3 text-base font-medium text-rose-600 active:bg-rose-50 disabled:opacity-60"
        >
          {deleting ? "Deleting…" : "Delete task"}
        </button>
      )}
    </div>
  );
}
