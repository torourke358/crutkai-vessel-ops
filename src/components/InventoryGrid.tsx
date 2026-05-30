"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Component } from "@/lib/types";
import {
  STATUS_BADGE_CLASS,
  STATUS_LABELS,
  computeStatus,
} from "@/lib/inventory";

export interface GridRow {
  id: string;
  part_name: string;
  part_number: string | null;
  make: string | null;
  quantity: number;
  unit: string;
  location: string | null;
  related_component_id: string | null;
  critical_threshold: number | null;
  notes: string | null;
}

type Field = keyof Omit<GridRow, "id">;
type ValueByField = {
  part_name: string;
  part_number: string;
  make: string;
  quantity: number;
  unit: string;
  location: string;
  related_component_id: string;
  critical_threshold: string;
  notes: string;
};
type EditState = Partial<ValueByField>;

const cellInputClass =
  "w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-slate-900 hover:border-slate-200 focus:border-violet-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-200";

export default function InventoryGrid({
  rows: initial,
  components,
}: {
  rows: GridRow[];
  components: Component[];
}) {
  const router = useRouter();
  const [rows] = useState<GridRow[]>(initial);
  const [edits, setEdits] = useState<Map<string, EditState>>(new Map());
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [componentFilter, setComponentFilter] = useState<string | "all">("all");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [search]);

  const componentName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of components) m.set(c.id, c.name);
    return m;
  }, [components]);

  // Fast lookup: return the current displayed value (edited override OR
  // original) for a row+field.
  function value(row: GridRow, field: Field): string | number {
    const e = edits.get(row.id);
    if (e && field in e) {
      const v = (e as Record<string, unknown>)[field];
      return (v as string | number) ?? "";
    }
    const original = row[field];
    if (original == null) return "";
    if (typeof original === "number") return original;
    return original;
  }

  function setField(rowId: string, field: Field, value: string | number) {
    setEdits((prev) => {
      const next = new Map(prev);
      const current = next.get(rowId) ?? {};
      next.set(rowId, { ...current, [field]: value });
      return next;
    });
    setMessage(null);
    setError(null);
  }

  function discardRow(rowId: string) {
    setEdits((prev) => {
      const next = new Map(prev);
      next.delete(rowId);
      return next;
    });
  }

  function discardAll() {
    setEdits(new Map());
    setMessage(null);
    setError(null);
  }

  // Visible subset after filter + search. Edits don't affect visibility.
  const visible = useMemo(() => {
    const terms = debounced.split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (componentFilter !== "all" && r.related_component_id !== componentFilter) return false;
      if (terms.length > 0) {
        const hay = `${r.part_name} ${r.part_number ?? ""} ${r.make ?? ""} ${r.location ?? ""}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }, [rows, componentFilter, debounced]);

  // Build the PATCH payload from `edits` — only fields that actually changed.
  function buildUpdates() {
    const updates: (Partial<GridRow> & { id: string })[] = [];
    for (const [id, e] of edits.entries()) {
      const row = rows.find((r) => r.id === id);
      if (!row) continue;
      const u: Partial<GridRow> & { id: string } = { id };
      let changed = false;
      for (const [k, raw] of Object.entries(e)) {
        const field = k as Field;
        if (raw === undefined) continue;
        if (field === "quantity") {
          const n = raw === "" || raw == null ? 0 : Number(raw);
          if (n !== row.quantity) {
            u.quantity = n;
            changed = true;
          }
        } else if (field === "critical_threshold") {
          const n = raw === "" || raw == null ? null : Number(raw);
          if (n !== row.critical_threshold) {
            u.critical_threshold = n;
            changed = true;
          }
        } else {
          const incoming = typeof raw === "string" ? raw.trim() : raw;
          const nullable = (
            ["part_number", "make", "location", "related_component_id", "notes"] as Field[]
          ).includes(field);
          const normalized = nullable && incoming === "" ? null : (incoming as string);
          if (normalized !== row[field]) {
            (u as Record<string, unknown>)[field] = normalized;
            changed = true;
          }
        }
      }
      if (changed) updates.push(u);
    }
    return updates;
  }

  async function save() {
    setError(null);
    setMessage(null);
    const updates = buildUpdates();
    if (updates.length === 0) {
      setError("No changes to save.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/inventory/bulk-update", {
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
      failed: number;
      requested: number;
    };
    setMessage(
      `Saved ${body.updated} of ${body.requested} row(s).${
        body.failed > 0 ? ` ${body.failed} failed.` : ""
      }`,
    );
    setEdits(new Map());
    router.refresh();
  }

  const dirtyCount = edits.size;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">
          Edit inventory · {rows.length} item{rows.length === 1 ? "" : "s"}
        </h1>
        <Link href="/inventory" className="text-sm text-slate-500">
          Back
        </Link>
      </div>

      <p className="text-sm text-slate-500">
        Every cell is editable. Click into a cell, change it, then Save. Touch
        threshold-setting does <span className="font-medium">not</span> fire
        alerts — only stock changes do.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search part / number / make / location…"
          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
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
        <span className="text-sm text-slate-500">
          {visible.length} of {rows.length}
        </span>
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {message && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>
      )}

      {/* Sticky action bar */}
      <div className="sticky top-16 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
        <p className="text-sm text-slate-700">
          {dirtyCount === 0
            ? "No unsaved changes."
            : `${dirtyCount} row${dirtyCount === 1 ? "" : "s"} with unsaved changes.`}
        </p>
        <div className="flex items-center gap-2">
          {dirtyCount > 0 && (
            <button
              onClick={discardAll}
              disabled={saving}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Discard all
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

      {/* Grid */}
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-100">
        <table className="w-full min-w-[1200px] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <Th className="w-[20%]">Part name</Th>
              <Th>Part #</Th>
              <Th>Make</Th>
              <Th className="w-20 text-right">Qty</Th>
              <Th className="w-24">Unit</Th>
              <Th>Location</Th>
              <Th>Component</Th>
              <Th className="w-24 text-right">Critical</Th>
              <Th className="w-28">Status</Th>
              <Th>Notes</Th>
              <Th className="w-20" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={11} className="p-6 text-center text-sm text-slate-400">
                  No rows match.
                </td>
              </tr>
            ) : (
              visible.map((r) => {
                const dirty = edits.has(r.id);
                const qty = Number(value(r, "quantity"));
                const thr = value(r, "critical_threshold");
                const status = computeStatus(qty, thr === "" ? null : Number(thr));
                return (
                  <tr
                    key={r.id}
                    className={`border-t border-slate-100 ${
                      dirty ? "bg-violet-50/40" : "bg-white"
                    }`}
                  >
                    <Td>
                      <input
                        value={value(r, "part_name") as string}
                        onChange={(e) => setField(r.id, "part_name", e.target.value)}
                        className={cellInputClass}
                      />
                    </Td>
                    <Td>
                      <input
                        value={value(r, "part_number") as string}
                        onChange={(e) => setField(r.id, "part_number", e.target.value)}
                        className={cellInputClass}
                      />
                    </Td>
                    <Td>
                      <input
                        value={value(r, "make") as string}
                        onChange={(e) => setField(r.id, "make", e.target.value)}
                        className={cellInputClass}
                      />
                    </Td>
                    <Td className="text-right">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={value(r, "quantity") as number}
                        onChange={(e) =>
                          setField(
                            r.id,
                            "quantity",
                            Math.max(0, Number(e.target.value || 0)),
                          )
                        }
                        className={`${cellInputClass} tabular-nums text-right`}
                      />
                    </Td>
                    <Td>
                      <input
                        value={value(r, "unit") as string}
                        onChange={(e) => setField(r.id, "unit", e.target.value)}
                        className={cellInputClass}
                      />
                    </Td>
                    <Td>
                      <input
                        value={value(r, "location") as string}
                        onChange={(e) => setField(r.id, "location", e.target.value)}
                        className={cellInputClass}
                      />
                    </Td>
                    <Td>
                      <select
                        value={(value(r, "related_component_id") as string) || ""}
                        onChange={(e) =>
                          setField(r.id, "related_component_id", e.target.value)
                        }
                        className={cellInputClass}
                      >
                        <option value="">—</option>
                        {components.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      {componentName.get(r.related_component_id ?? "") && !dirty && null}
                    </Td>
                    <Td className="text-right">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={value(r, "critical_threshold") as string | number}
                        placeholder="—"
                        onChange={(e) => setField(r.id, "critical_threshold", e.target.value)}
                        className={`${cellInputClass} tabular-nums text-right`}
                      />
                    </Td>
                    <Td>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[status]}`}
                      >
                        {STATUS_LABELS[status]}
                      </span>
                    </Td>
                    <Td>
                      <input
                        value={value(r, "notes") as string}
                        onChange={(e) => setField(r.id, "notes", e.target.value)}
                        className={cellInputClass}
                      />
                    </Td>
                    <Td className="text-right">
                      {dirty && (
                        <button
                          onClick={() => discardRow(r.id)}
                          className="text-xs text-slate-500 hover:text-rose-600"
                        >
                          Revert
                        </button>
                      )}
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ className = "", children }: { className?: string; children?: React.ReactNode }) {
  return <th className={`px-3 py-2 ${className}`}>{children}</th>;
}

function Td({ className = "", children }: { className?: string; children?: React.ReactNode }) {
  return <td className={`px-1 py-1 align-middle ${className}`}>{children}</td>;
}
