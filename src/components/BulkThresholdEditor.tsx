"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Component } from "@/lib/types";

export interface BulkThresholdRow {
  id: string;
  part_name: string;
  part_number: string | null;
  componentId: string | null;
  componentName: string | null;
  quantity: number;
  unit: string;
  critical_threshold: number | null;
}

export default function BulkThresholdEditor({
  rows,
  components,
}: {
  rows: BulkThresholdRow[];
  components: Component[];
}) {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [componentFilter, setComponentFilter] = useState<string | "all">("all");
  const [onlyMissing, setOnlyMissing] = useState(true);

  const [bulkValue, setBulkValue] = useState("");
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map());

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (componentFilter !== "all" && r.componentId !== componentFilter) return false;
      if (onlyMissing && r.critical_threshold != null) return false;
      if (q) {
        const hay = `${r.part_name} ${r.part_number ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, componentFilter, onlyMissing]);

  function valueFor(r: BulkThresholdRow): string {
    const o = overrides.get(r.id);
    if (o !== undefined) return o;
    return r.critical_threshold == null ? "" : String(r.critical_threshold);
  }

  function setRow(id: string, v: string) {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(id, v);
      return next;
    });
  }

  function applyBulkToVisible() {
    setError(null);
    setMessage(null);
    if (bulkValue === "") {
      setError("Enter a value to apply, or use the per-row inputs.");
      return;
    }
    const v = Number(bulkValue);
    if (!Number.isInteger(v) || v < 0) {
      setError("Threshold must be a non-negative integer.");
      return;
    }
    setOverrides((prev) => {
      const next = new Map(prev);
      for (const r of visible) next.set(r.id, String(v));
      return next;
    });
    setMessage(`Set ${visible.length} row(s) to ${v} in the form. Click Save to commit.`);
  }

  async function save() {
    setError(null);
    setMessage(null);

    const updates: { id: string; critical_threshold: number | null }[] = [];
    for (const r of rows) {
      const raw = overrides.get(r.id);
      if (raw === undefined) continue;
      if (raw === "") {
        if (r.critical_threshold != null) updates.push({ id: r.id, critical_threshold: null });
      } else {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0) {
          setError(`Row "${r.part_name}" has an invalid threshold.`);
          return;
        }
        if (n !== r.critical_threshold) {
          updates.push({ id: r.id, critical_threshold: n });
        }
      }
    }

    if (updates.length === 0) {
      setError("No changes to save.");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/inventory/bulk-thresholds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });
    setSaving(false);

    if (!res.ok) {
      setError("Save failed. Please try again.");
      return;
    }
    const body = await res.json().catch(() => ({}));
    setMessage(`Saved ${body.updated ?? updates.length} of ${updates.length} change(s).`);
    setOverrides(new Map());
    router.refresh();
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Bulk thresholds</h1>
        <Link href="/inventory" className="text-sm text-slate-500">
          Back
        </Link>
      </div>

      <p className="text-sm text-slate-500">
        Set a critical threshold for one item, a filtered subset, or everything
        without a threshold. Setting a threshold does not fire alerts — only
        stock changes do.
      </p>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
        />
        <select
          value={componentFilter}
          onChange={(e) => setComponentFilter(e.target.value as string | "all")}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
        >
          <option value="all">All components</option>
          {components.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
          />
          Only items without a threshold
        </label>
        <div className="ml-auto text-sm text-slate-500">
          {visible.length} of {rows.length}
        </div>
      </div>

      {/* Bulk-apply control */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 ring-1 ring-slate-100">
        <span className="text-sm font-medium text-slate-700">Apply to visible:</span>
        <input
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          placeholder="e.g. 4"
          value={bulkValue}
          onChange={(e) => setBulkValue(e.target.value)}
          className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
        />
        <button
          onClick={applyBulkToVisible}
          className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
        >
          Apply
        </button>
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </p>
      )}

      {/* Editable table */}
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
        {visible.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">No rows match.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">
                    {r.part_name}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {[r.part_number, r.componentName].filter(Boolean).join(" · ") || "—"}{" "}
                    · qty {r.quantity} {r.unit}
                  </p>
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  placeholder="—"
                  value={valueFor(r)}
                  onChange={(e) => setRow(r.id, e.target.value)}
                  className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm tabular-nums text-slate-700"
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}
