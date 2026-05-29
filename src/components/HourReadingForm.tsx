"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Inline form to record a new hour reading. Any signed-in user can call it.
export default function HourReadingForm({
  equipmentId,
  currentHours,
}: {
  equipmentId: string;
  currentHours: number | null;
}) {
  const router = useRouter();
  const [hours, setHours] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const n = Number(hours);
    if (!Number.isInteger(n) || n < 0) {
      setError("Hours must be a non-negative integer.");
      return;
    }
    if (currentHours != null && n < currentHours) {
      setError(`Reading must be at least the current ${currentHours}.`);
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/equipment/${equipmentId}/hour-reading`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours: n }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      setError(body?.message || "Couldn't save reading. Please try again.");
      return;
    }
    setHours("");
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-2 rounded-2xl bg-white p-3 ring-1 ring-slate-100"
    >
      <div>
        <label className="block text-xs font-medium text-slate-500">
          New reading
        </label>
        <input
          type="number"
          inputMode="numeric"
          step="1"
          min={currentHours ?? 0}
          required
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder={currentHours != null ? `≥ ${currentHours}` : "e.g. 1250"}
          className="mt-1 w-32 rounded-lg border border-slate-200 px-3 py-1.5 text-sm tabular-nums"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Record"}
      </button>
      {error && (
        <p className="basis-full text-sm text-rose-700">{error}</p>
      )}
    </form>
  );
}
