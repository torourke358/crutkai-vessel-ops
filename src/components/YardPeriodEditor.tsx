"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { YardPeriod } from "@/lib/types";

export default function YardPeriodEditor({ initial }: { initial: YardPeriod | null }) {
  const router = useRouter();
  const isEdit = initial != null;

  const [name, setName] = useState(initial?.name ?? "");
  const [start, setStart] = useState(initial?.start_date ?? "");
  const [end, setEnd] = useState(initial?.end_date ?? "");
  const [status, setStatus] = useState(initial?.status ?? "planned");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    if (!name.trim() || !start) {
      setError("Name and start date are required.");
      return;
    }
    setSaving(true);
    setError(null);

    const body = {
      name: name.trim(),
      start_date: start,
      end_date: end || null,
      status,
      notes: notes.trim() || null,
    };

    const res = await fetch(
      isEdit ? `/api/yard-periods/${initial!.id}` : "/api/yard-periods",
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
      const created = await res.json();
      router.push(`/yard/${created.id}`);
      router.refresh();
    }
  }

  async function remove() {
    if (!initial) return;
    if (!confirm(`Delete "${initial.name}" and ALL its quadrants + tasks? This can't be undone.`)) return;
    setDeleting(true);

    const res = await fetch(`/api/yard-periods/${initial.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Delete failed.");
      setDeleting(false);
      return;
    }
    router.push("/yard");
    router.refresh();
  }

  const inputClass =
    "mt-1 block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200";

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">
          {isEdit ? `Edit · ${initial.name}` : "New yard period"}
        </h1>
        <Link href="/yard" className="text-sm text-slate-500">
          Back
        </Link>
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {message && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Start date *</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">End date</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "planned" | "active" | "closed")}
            className={inputClass}
          >
            <option value="planned">Planned</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Notes</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
      >
        {saving ? "Saving…" : isEdit ? "Save changes" : "Create period"}
      </button>

      {isEdit && (
        <button
          onClick={remove}
          disabled={deleting}
          className="flex w-full items-center justify-center rounded-xl border border-rose-200 px-4 py-3 text-base font-medium text-rose-600 active:bg-rose-50 disabled:opacity-60"
        >
          {deleting ? "Deleting…" : "Delete period (and tasks)"}
        </button>
      )}
    </div>
  );
}
