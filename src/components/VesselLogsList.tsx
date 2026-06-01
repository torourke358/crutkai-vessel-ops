"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate, todayLocal } from "@/lib/format";
import {
  VESSEL_LOG_CATEGORY_LABELS,
  type VesselLog,
  type VesselLogCategory,
} from "@/lib/types";

const TONE: Record<VesselLogCategory, string> = {
  crossing: "bg-sky-100 text-sky-700",
  charter: "bg-violet-100 text-violet-700",
  guest: "bg-amber-100 text-amber-700",
  crew: "bg-emerald-100 text-emerald-700",
  other: "bg-slate-100 text-slate-600",
};

export default function VesselLogsList({
  initial,
  nameById,
}: {
  initial: VesselLog[];
  nameById: Map<string, string>;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    log_date: todayLocal(),
    category: "other" as VesselLogCategory,
    title: "",
    body: "",
  });

  async function add() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        log_date: form.log_date,
        category: form.category,
        title: form.title.trim(),
        body: form.body.trim() || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't save log.");
      return;
    }
    const row = (await res.json()) as VesselLog;
    setItems((prev) => [row, ...prev]);
    setForm({ log_date: todayLocal(), category: "other", title: "", body: "" });
    setAdding(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        {!adding ? (
          <button
            onClick={() => setAdding(true)}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >
            + New entry
          </button>
        ) : (
          <button
            onClick={() => setAdding(false)}
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            Cancel
          </button>
        )}
      </div>

      {adding && (
        <div className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-slate-100">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              type="date"
              value={form.log_date}
              onChange={(e) => setForm({ ...form, log_date: e.target.value })}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm"
            />
            <select
              value={form.category}
              onChange={(e) =>
                setForm({ ...form, category: e.target.value as VesselLogCategory })
              }
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm"
            >
              {(Object.entries(VESSEL_LOG_CATEGORY_LABELS) as [
                VesselLogCategory,
                string,
              ][]).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Title…"
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm"
            />
          </div>
          <textarea
            rows={3}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            placeholder="Details (optional)…"
            className="block w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm"
          />
          <div className="flex justify-end">
            <button
              onClick={add}
              disabled={busy || !form.title.trim()}
              className="rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save entry"}
            </button>
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>
      )}

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
        {items.length === 0 ? (
          <li className="p-6 text-center text-sm text-slate-400">
            No log entries yet.
          </li>
        ) : (
          items.map((l) => (
            <li key={l.id} className="space-y-1 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-slate-900">{l.title}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${TONE[l.category]}`}
                >
                  {VESSEL_LOG_CATEGORY_LABELS[l.category]}
                </span>
              </div>
              {l.body && (
                <p className="whitespace-pre-wrap text-sm text-slate-700">
                  {l.body}
                </p>
              )}
              <p className="text-xs text-slate-400">
                {formatDate(l.log_date)}
                {l.created_by && (
                  <span> · {nameById.get(l.created_by) ?? "Unknown"}</span>
                )}
              </p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
