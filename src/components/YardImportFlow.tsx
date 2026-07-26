"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Import a PRIOR yard period from a CSV/XLSX task list: upload → server-side
// parse with heuristic column mapping → editable preview → commit, which
// creates the period (closed by default — it's history) plus one yard task
// per row. Quadrant is matched by area name, falling back to Engineering.

interface ImportRow {
  title: string;
  area: string | null;
  notes: string | null;
  cost: number | null;
  due_date: string | null;
}

const QUADRANT_NAMES = ["Exterior", "Interior", "Engineering", "Freeman"];

export default function YardImportFlow() {
  const router = useRouter();
  const [step, setStep] = useState<"upload" | "preview" | "committing" | "done">("upload");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [periodName, setPeriodName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<"planned" | "active" | "closed">("closed");

  const [result, setResult] = useState<{ period_id: string; created: number; failed: number } | null>(
    null,
  );

  async function handleFile(file: File) {
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/yard-periods/import/parse", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        setError("Parsing failed.");
        return;
      }
      const body = (await res.json()) as
        | { rows: ImportRow[] }
        | { error: string; raw?: string };
      if ("error" in body) {
        setError(body.error + (body.raw ? `: ${body.raw.slice(0, 200)}` : ""));
        return;
      }
      setRows(body.rows);
      if (!periodName) {
        setPeriodName(file.name.replace(/\.(csv|xlsx)$/i, ""));
      }
      setStep("preview");
    } finally {
      setLoading(false);
    }
  }

  function updateRow(i: number, patch: Partial<ImportRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function commit() {
    if (!periodName.trim() || !startDate) {
      setError("Period name and start date are required.");
      return;
    }
    setError(null);
    setStep("committing");
    const res = await fetch("/api/yard-periods/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: periodName.trim(),
        start_date: startDate,
        end_date: endDate || null,
        status,
        rows,
      }),
    });
    if (!res.ok) {
      setError("Commit failed.");
      setStep("preview");
      return;
    }
    const body = (await res.json()) as { period_id: string; created: number; failed: number };
    setResult(body);
    setStep("done");
    router.refresh();
  }

  const inputClass =
    "mt-1 block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200";
  const smallInput = "rounded-lg border border-slate-200 px-2 py-1 text-sm";

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Import prior yard period</h1>
        <Link href="/yard" className="text-sm text-slate-500">
          Back
        </Link>
      </div>

      {step === "upload" && (
        <div className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-slate-100">
          <p className="text-sm text-slate-500">
            Upload a CSV or Excel (.xlsx) task list from a previous yard period.
            The first row must be headers — columns like task/title,
            area/quadrant, notes, cost and date are matched automatically. You
            verify and edit everything before it&apos;s saved.
          </p>
          <input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
            disabled={loading}
            className="block w-full text-sm text-slate-700"
          />
          {loading && <p className="text-sm text-slate-500">Reading…</p>}
          {error && (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
          )}
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          <div className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-slate-100">
            <div>
              <label className="block text-sm font-medium text-slate-700">Period name *</label>
              <input
                value={periodName}
                onChange={(e) => setPeriodName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Start date *</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">End date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "planned" | "active" | "closed")}
                className={inputClass}
              >
                <option value="closed">Closed (historical — tasks import as done)</option>
                <option value="planned">Planned</option>
                <option value="active">Active</option>
              </select>
            </div>
          </div>

          <p className="text-sm text-slate-500">
            {rows.length} task(s) parsed. Area matches a quadrant by name
            (Exterior / Interior / Engineering / Freeman); anything else lands
            in Engineering.
          </p>
          {error && (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
          )}

          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={i} className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-slate-100">
                <input
                  value={r.title}
                  onChange={(e) => updateRow(i, { title: e.target.value })}
                  placeholder="Task title"
                  className={`${smallInput} w-full`}
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <select
                    value={QUADRANT_NAMES.includes(r.area ?? "") ? (r.area as string) : ""}
                    onChange={(e) => updateRow(i, { area: e.target.value || null })}
                    className={smallInput}
                  >
                    <option value="">
                      {r.area ? `${r.area} → Engineering` : "(Engineering)"}
                    </option>
                    {QUADRANT_NAMES.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={r.cost ?? ""}
                    onChange={(e) =>
                      updateRow(i, { cost: e.target.value === "" ? null : Number(e.target.value) })
                    }
                    placeholder="Cost (USD)"
                    className={`${smallInput} tabular-nums`}
                  />
                  <input
                    type="date"
                    value={r.due_date ?? ""}
                    onChange={(e) => updateRow(i, { due_date: e.target.value || null })}
                    className={smallInput}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <input
                    value={r.notes ?? ""}
                    onChange={(e) => updateRow(i, { notes: e.target.value || null })}
                    placeholder="Notes"
                    className={`${smallInput} flex-1`}
                  />
                  <button
                    onClick={() => removeRow(i)}
                    className="text-xs text-rose-600 hover:text-rose-800"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <button
            onClick={commit}
            disabled={rows.length === 0}
            className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
          >
            Create period + {rows.length} task(s)
          </button>
        </div>
      )}

      {step === "committing" && <p className="text-sm text-slate-500">Saving…</p>}

      {step === "done" && result && (
        <div className="space-y-3">
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Created the period with {result.created} of {result.created + result.failed} task(s).
            {result.failed > 0 && ` ${result.failed} failed — check the server logs.`}
          </p>
          <Link
            href={`/yard/${result.period_id}`}
            className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-base font-medium text-white hover:bg-violet-700"
          >
            Open the period
          </Link>
        </div>
      )}
    </div>
  );
}
