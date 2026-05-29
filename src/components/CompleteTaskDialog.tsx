"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PartsConsumedPicker, {
  type PartsAvailable,
  type PartsRow,
} from "@/components/PartsConsumedPicker";

// Sign-off panel — opens inline. Hours field shows only for hours-based tasks.
export default function CompleteTaskDialog({
  taskId,
  dueType,
  currentHours,
  availableParts,
}: {
  taskId: string;
  dueType: "calendar" | "hours";
  currentHours: number | null;
  availableParts: PartsAvailable[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(currentHours != null ? String(currentHours) : "");
  const [comments, setComments] = useState("");
  const [parts, setParts] = useState<PartsRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);

    if (dueType === "hours" && hours === "") {
      setError("Hours at completion is required for hours-based tasks.");
      return;
    }
    const hoursNum = hours === "" ? null : Number(hours);
    if (hoursNum != null && (!Number.isInteger(hoursNum) || hoursNum < 0)) {
      setError("Hours must be a non-negative integer.");
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/maintenance/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comments: comments.trim() || null,
        hours_at_completion: hoursNum,
        parts,
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      setError(body?.message || "Sign-off failed. Please try again.");
      setSaving(false);
      return;
    }

    setSaving(false);
    setOpen(false);
    setComments("");
    setParts([]);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-emerald-700"
      >
        Mark complete
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Complete this task</h3>
        <button
          onClick={() => setOpen(false)}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>

      {dueType === "hours" && (
        <div>
          <label htmlFor="hours" className="block text-sm font-medium text-slate-700">
            Hours at completion *
          </label>
          <input
            id="hours"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            required
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="mt-1 block w-32 rounded-xl border border-slate-200 px-3 py-2 text-sm tabular-nums"
          />
        </div>
      )}

      <div>
        <label htmlFor="comments" className="block text-sm font-medium text-slate-700">
          Comments
        </label>
        <textarea
          id="comments"
          rows={2}
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
        />
      </div>

      <PartsConsumedPicker available={availableParts} rows={parts} onChange={setParts} />

      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      )}

      <button
        onClick={submit}
        disabled={saving}
        className="flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Confirm sign-off"}
      </button>
    </div>
  );
}
