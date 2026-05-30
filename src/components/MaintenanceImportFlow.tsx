"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Component } from "@/lib/types";

interface ExtractedRow {
  title: string;
  equipment_name: string;
  system: string | null;
  priority: "low" | "moderate" | "high" | "critical" | null;
  last_completed: string | null;
  next_due: string | null;
  due_type: "calendar" | "hours";
  interval_days: number | null;
  interval_hours: number | null;
}

interface CommitRow {
  title: string;
  equipment_name: string;
  system_id: string | null;
  priority: "low" | "moderate" | "high" | "critical" | null;
  due_type: "calendar" | "hours";
  interval_days: number | null;
  interval_hours: number | null;
  last_done_date: string | null;
}

interface ExistingEquipment {
  id: string;
  name: string;
}

export default function MaintenanceImportFlow({
  components,
  existingEquipment,
}: {
  components: Component[];
  existingEquipment: ExistingEquipment[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<"upload" | "preview" | "committing" | "done">("upload");
  const [rows, setRows] = useState<CommitRow[]>([]);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{
    equipment_created: number;
    tasks_created: number;
    failed: number;
  } | null>(null);

  const equipNames = useMemo(
    () => new Set(existingEquipment.map((e) => e.name.toLowerCase().trim())),
    [existingEquipment],
  );

  function systemNameToId(name: string | null): string | null {
    if (!name) return null;
    const lower = name.toLowerCase();
    return components.find((c) => c.name.toLowerCase() === lower)?.id ?? null;
  }

  async function handleFile(file: File) {
    setExtractError(null);
    setProgress("Reading PDF…");

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = String(reader.result);
        const base64 = dataUrl.split(",")[1] ?? "";
        setProgress("Sending to Claude (this may take a minute for 300 rows)…");

        const res = await fetch("/api/maintenance/import/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdf_base64: base64 }),
        });
        setProgress(null);

        if (!res.ok) {
          setExtractError("Extraction failed.");
          return;
        }
        const body = (await res.json()) as
          | { rows: ExtractedRow[]; count: number; pages: number; chunks: number; errors: { chunk: string; reason: string }[] }
          | { error: string };

        if ("error" in body) {
          setExtractError(body.error);
          return;
        }

        const mapped: CommitRow[] = body.rows.map((r) => ({
          title: r.title,
          equipment_name: r.equipment_name,
          system_id: systemNameToId(r.system),
          priority: r.priority,
          due_type: r.due_type,
          interval_days: r.interval_days,
          interval_hours: r.interval_hours,
          last_done_date: r.last_completed,
        }));
        setRows(mapped);
        setStep("preview");

        if (body.errors && body.errors.length > 0) {
          setExtractError(
            `${body.errors.length} chunk(s) failed extraction. Visible rows are partial.`,
          );
        }
      } catch (err) {
        setProgress(null);
        setExtractError(err instanceof Error ? err.message : "Read failed.");
      }
    };
    reader.readAsDataURL(file);
  }

  function updateRow(i: number, patch: Partial<CommitRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function commit() {
    setStep("committing");
    const res = await fetch("/api/maintenance/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    if (!res.ok) {
      setExtractError("Commit failed.");
      setStep("preview");
      return;
    }
    const body = (await res.json()) as {
      equipment_created: number;
      tasks_created: number;
      failed: number;
    };
    setResult(body);
    setStep("done");
    router.refresh();
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Import maintenance tasks</h1>
        <Link href="/maintenance/tasks" className="text-sm text-slate-500">
          Back
        </Link>
      </div>

      {step === "upload" && (
        <div className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-slate-100">
          <p className="text-sm text-slate-500">
            Upload a Seahub maintenance export PDF. The PDF is split into 3-page
            chunks and parsed by Claude vision. Equipment referenced by tasks
            but not yet in the system will be auto-created at commit time.
          </p>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            disabled={progress != null}
            className="block w-full text-sm text-slate-700"
          />
          {progress && <p className="text-sm text-slate-500">{progress}</p>}
          {extractError && (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {extractError}
            </p>
          )}
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            {rows.length} task(s) extracted. Edit any cell. Rows whose equipment
            name doesn&apos;t match an existing entry are marked&nbsp;
            <span className="inline-block rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
              new
            </span>{" "}
            — those will auto-create equipment on commit.
          </p>
          {extractError && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {extractError}
            </p>
          )}

          <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-100">
            <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Equipment</th>
                  <th className="px-3 py-2">System</th>
                  <th className="px-3 py-2">Priority</th>
                  <th className="px-3 py-2">Due type</th>
                  <th className="px-3 py-2 text-right">Interval</th>
                  <th className="px-3 py-2">Last done</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isNew = !equipNames.has(r.equipment_name.toLowerCase().trim());
                  return (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-2 py-1">
                        <input
                          value={r.title}
                          onChange={(e) => updateRow(i, { title: e.target.value })}
                          className="w-full rounded-md border border-transparent px-2 py-1 text-sm hover:border-slate-200 focus:border-violet-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <div className="flex items-center gap-1">
                          <input
                            value={r.equipment_name}
                            onChange={(e) => updateRow(i, { equipment_name: e.target.value })}
                            className="w-full rounded-md border border-transparent px-2 py-1 text-sm hover:border-slate-200 focus:border-violet-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
                          />
                          {isNew && (
                            <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                              new
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        <select
                          value={r.system_id ?? ""}
                          onChange={(e) =>
                            updateRow(i, { system_id: e.target.value || null })
                          }
                          className="w-full rounded-md border border-transparent px-2 py-1 text-sm hover:border-slate-200 focus:border-violet-500 focus:bg-white focus:outline-none"
                        >
                          <option value="">—</option>
                          {components.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <select
                          value={r.priority ?? ""}
                          onChange={(e) =>
                            updateRow(i, {
                              priority: (e.target.value || null) as CommitRow["priority"],
                            })
                          }
                          className="w-full rounded-md border border-transparent px-2 py-1 text-sm hover:border-slate-200 focus:border-violet-500 focus:bg-white focus:outline-none"
                        >
                          <option value="">—</option>
                          <option value="low">Low</option>
                          <option value="moderate">Moderate</option>
                          <option value="high">High</option>
                          <option value="critical">Critical</option>
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <select
                          value={r.due_type}
                          onChange={(e) =>
                            updateRow(i, {
                              due_type: e.target.value as "calendar" | "hours",
                            })
                          }
                          className="w-full rounded-md border border-transparent px-2 py-1 text-sm hover:border-slate-200 focus:border-violet-500 focus:bg-white focus:outline-none"
                        >
                          <option value="calendar">Calendar</option>
                          <option value="hours">Hours</option>
                        </select>
                      </td>
                      <td className="px-2 py-1 text-right">
                        {r.due_type === "calendar" ? (
                          <input
                            type="number"
                            min={1}
                            value={r.interval_days ?? ""}
                            placeholder="days"
                            onChange={(e) =>
                              updateRow(i, {
                                interval_days: e.target.value === "" ? null : Number(e.target.value),
                              })
                            }
                            className="w-24 rounded-md border border-transparent px-2 py-1 text-right text-sm tabular-nums hover:border-slate-200 focus:border-violet-500 focus:bg-white focus:outline-none"
                          />
                        ) : (
                          <input
                            type="number"
                            min={1}
                            value={r.interval_hours ?? ""}
                            placeholder="hrs"
                            onChange={(e) =>
                              updateRow(i, {
                                interval_hours: e.target.value === "" ? null : Number(e.target.value),
                              })
                            }
                            className="w-24 rounded-md border border-transparent px-2 py-1 text-right text-sm tabular-nums hover:border-slate-200 focus:border-violet-500 focus:bg-white focus:outline-none"
                          />
                        )}
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="date"
                          value={r.last_done_date ?? ""}
                          onChange={(e) =>
                            updateRow(i, { last_done_date: e.target.value || null })
                          }
                          className="rounded-md border border-transparent px-2 py-1 text-sm hover:border-slate-200 focus:border-violet-500 focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <button
                          onClick={() => removeRow(i)}
                          className="text-xs text-rose-600 hover:text-rose-800"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            onClick={commit}
            disabled={rows.length === 0}
            className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
          >
            Commit {rows.length} task{rows.length === 1 ? "" : "s"}
          </button>
        </div>
      )}

      {step === "committing" && <p className="text-sm text-slate-500">Saving…</p>}

      {step === "done" && result && (
        <div className="space-y-3">
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Created {result.tasks_created} task(s) and {result.equipment_created}{" "}
            new equipment row(s).
            {result.failed > 0 && ` ${result.failed} row(s) failed — check the server logs.`}
          </p>
          <Link
            href="/maintenance/tasks"
            className="flex w-full items-center justify-center rounded-xl bg-slate-100 px-4 py-3 text-base font-medium text-slate-700 hover:bg-slate-200"
          >
            View tasks
          </Link>
        </div>
      )}
    </div>
  );
}
