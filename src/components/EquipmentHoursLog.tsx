"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface LogRow {
  id: string;
  name: string;
  location_on_vessel: string | null;
  current_hours: number | null;
  next_pm_hours: number | null; // the closest upcoming hours-based PM threshold
}

// One screen for the engineering routine: walk the engine room, read every
// hour meter, type each reading in, hit Save once. Each input keeps its own
// draft state; only changed rows go to the API.
export default function EquipmentHoursLog({ rows }: { rows: LogRow[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{
    updated: number;
    unchanged: number;
    failed: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function valueFor(r: LogRow): string {
    const d = drafts.get(r.id);
    if (d !== undefined) return d;
    return r.current_hours == null ? "" : String(r.current_hours);
  }

  function setRow(id: string, v: string) {
    setDrafts((prev) => {
      const next = new Map(prev);
      next.set(id, v);
      return next;
    });
    setError(null);
    setResult(null);
  }

  function discardAll() {
    setDrafts(new Map());
    setError(null);
    setResult(null);
  }

  function buildUpdates() {
    const updates: { equipment_id: string; hours: number }[] = [];
    for (const r of rows) {
      const raw = drafts.get(r.id);
      if (raw === undefined || raw === "") continue;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) continue;
      if (n === r.current_hours) continue;
      updates.push({ equipment_id: r.id, hours: n });
    }
    return updates;
  }

  async function save() {
    setError(null);
    setResult(null);
    const updates = buildUpdates();
    if (updates.length === 0) {
      setError("No changed readings to save.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/equipment/bulk-hours", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Save failed.");
      return;
    }
    const body = (await res.json()) as {
      updated: number;
      unchanged: number;
      failed: number;
      failures?: { id: string; reason: string }[];
    };
    setResult(body);
    if (body.failed > 0) {
      const lines = (body.failures ?? []).map((f) => f.reason).slice(0, 3).join("; ");
      setError(`${body.failed} row(s) failed: ${lines}`);
    }
    setDrafts(new Map());
    router.refresh();
  }

  // Visual cue: if current_hours is within 10% of next_pm_hours, show amber.
  // If past it, show rose.
  function pmStatus(r: LogRow): {
    label: string;
    tone: "ok" | "soon" | "due";
  } | null {
    if (r.next_pm_hours == null || r.current_hours == null) return null;
    const remaining = r.next_pm_hours - r.current_hours;
    if (remaining <= 0) return { label: "PM due", tone: "due" };
    // 10% window of remaining-until-PM is too late; use 10% of interval.
    // We don't know the interval here — approximate with 10% of the next PM
    // threshold itself (e.g. 10% of 1500 = 150). Good enough for a hint.
    const window = Math.max(1, Math.round(r.next_pm_hours * 0.10));
    if (remaining <= window) {
      return { label: `${remaining} hrs to PM`, tone: "soon" };
    }
    return { label: `${remaining} hrs to PM`, tone: "ok" };
  }

  const dirtyCount = buildUpdates().length;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Log hours</h1>
        <Link href="/equipment" className="text-sm text-slate-500">
          Back
        </Link>
      </div>

      <p className="text-sm text-slate-500">
        Walk the engine room, type the current reading next to each piece of
        equipment, hit Save. Only rows you changed get committed. Hours can
        only go up.
      </p>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {result && !error && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Saved {result.updated} row(s).
          {result.unchanged > 0 ? ` ${result.unchanged} unchanged.` : ""}
        </p>
      )}

      <div className="sticky top-16 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
        <p className="text-sm text-slate-700">
          {dirtyCount === 0
            ? "No new readings yet."
            : `${dirtyCount} reading${dirtyCount === 1 ? "" : "s"} ready to save.`}
        </p>
        <div className="flex items-center gap-2">
          {dirtyCount > 0 && (
            <button
              onClick={discardAll}
              disabled={saving}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Discard
            </button>
          )}
          <button
            onClick={save}
            disabled={saving || dirtyCount === 0}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : `Save ${dirtyCount > 0 ? dirtyCount : ""}`.trim()}
          </button>
        </div>
      </div>

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
        {rows.length === 0 ? (
          <li className="p-6 text-center text-sm text-slate-400">
            No active equipment yet.
          </li>
        ) : (
          rows.map((r) => {
            const pm = pmStatus(r);
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/equipment/${r.id}`}
                    className="truncate font-medium text-slate-900 hover:text-violet-700"
                  >
                    {r.name}
                  </Link>
                  <p className="truncate text-xs text-slate-400">
                    {r.location_on_vessel ?? "—"}
                    {pm && (
                      <span
                        className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          pm.tone === "due"
                            ? "bg-rose-100 text-rose-700"
                            : pm.tone === "soon"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {pm.label}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">
                    was {r.current_hours ?? "—"}
                  </span>
                  <input
                    type="number"
                    min={r.current_hours ?? 0}
                    step={1}
                    value={valueFor(r)}
                    onChange={(e) => setRow(r.id, e.target.value)}
                    placeholder="—"
                    className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm tabular-nums focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  />
                  <span className="text-xs text-slate-400">hrs</span>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
