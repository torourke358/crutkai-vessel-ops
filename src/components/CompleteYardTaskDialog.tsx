"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PartsConsumedPicker, {
  type PartsAvailable,
  type PartsRow,
} from "@/components/PartsConsumedPicker";

export default function CompleteYardTaskDialog({
  periodId,
  taskId,
  availableParts,
}: {
  periodId: string;
  taskId: string;
  availableParts: PartsAvailable[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cost, setCost] = useState("");
  const [parts, setParts] = useState<PartsRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const costNum = cost === "" ? null : Number(cost);
    if (costNum != null && (Number.isNaN(costNum) || costNum < 0)) {
      setError("Cost must be a non-negative number.");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/yard-periods/${periodId}/tasks/${taskId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actual_cost: costNum, parts }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Couldn't complete task.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-base font-medium text-white hover:bg-emerald-700"
      >
        Mark task complete
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Complete this task</h3>
        <button onClick={() => setOpen(false)} className="text-sm text-slate-500">
          Cancel
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Final actual cost (USD)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          className="mt-1 block w-40 rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
      </div>

      <PartsConsumedPicker available={availableParts} rows={parts} onChange={setParts} />

      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      <button
        onClick={submit}
        disabled={saving}
        className="flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-base font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Confirm complete"}
      </button>
    </div>
  );
}
