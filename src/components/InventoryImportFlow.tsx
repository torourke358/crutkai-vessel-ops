"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Component } from "@/lib/types";

interface ExtractedRow {
  part_name: string;
  part_number: string | null;
  make: string | null;
  quantity: number;
  unit: string;
  location: string | null;
  related_component: string | null; // raw AI value before mapping
  critical_threshold: number | null;
  // Present on spreadsheet extractions only.
  unit_price?: number | null;
  supplier?: string | null;
}

interface CommitRow {
  part_name: string;
  part_number: string | null;
  make: string | null;
  quantity: number;
  unit: string;
  location: string | null;
  component_ids: string[];
  critical_threshold: number | null;
  unit_price: number | null;
  supplier: string | null;
}

export default function InventoryImportFlow({ components }: { components: Component[] }) {
  const router = useRouter();
  const [step, setStep] = useState<"upload" | "preview" | "committing" | "done">("upload");
  const [rows, setRows] = useState<CommitRow[]>([]);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<{ created: number; failed: number } | null>(null);
  const [loading, setLoading] = useState(false);

  function nameToComponentId(name: string | null): string | null {
    if (!name) return null;
    const lower = name.toLowerCase();
    return components.find((c) => c.name.toLowerCase() === lower)?.id ?? null;
  }

  function mapExtracted(rows: ExtractedRow[]): CommitRow[] {
    return rows.map((r) => ({
      part_name: r.part_name,
      part_number: r.part_number,
      make: r.make,
      quantity: r.quantity ?? 0,
      unit: r.unit || "Units",
      location: r.location,
      component_ids: nameToComponentId(r.related_component)
        ? [nameToComponentId(r.related_component) as string]
        : [],
      critical_threshold: r.critical_threshold,
      unit_price: r.unit_price ?? null,
      supplier: r.supplier ?? null,
    }));
  }

  // Spreadsheet source (CSV / XLSX) — parsed server-side, same preview shape.
  async function handleSpreadsheet(file: File) {
    setLoading(true);
    setExtractError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/inventory/import/spreadsheet", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        setExtractError("Spreadsheet parsing failed.");
        return;
      }
      const body = (await res.json()) as
        | { rows: ExtractedRow[] }
        | { error: string; raw?: string };
      if ("error" in body) {
        setExtractError(body.error + (body.raw ? `: ${body.raw.slice(0, 200)}` : ""));
        return;
      }
      setRows(mapExtracted(body.rows));
      setStep("preview");
    } finally {
      setLoading(false);
    }
  }

  async function handleFile(file: File) {
    setLoading(true);
    setExtractError(null);

    const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = String(reader.result);
        const base64 = dataUrl.split(",")[1] ?? "";
        const payload = isPdf
          ? { pdf_base64: base64 }
          : { image_base64: base64, media_type: file.type || "image/jpeg" };

        const res = await fetch("/api/inventory/import/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          setExtractError("Extraction failed.");
          setLoading(false);
          return;
        }
        const body = (await res.json()) as
          | { rows: ExtractedRow[] }
          | { error: string; raw?: string };

        if ("error" in body) {
          setExtractError(body.error + (body.raw ? `: ${body.raw.slice(0, 200)}` : ""));
          setLoading(false);
          return;
        }

        setRows(mapExtracted(body.rows));
        setStep("preview");
      } finally {
        setLoading(false);
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
    const res = await fetch("/api/inventory/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    if (!res.ok) {
      setExtractError("Commit failed.");
      setStep("preview");
      return;
    }
    const body = (await res.json()) as { created: number; failed: number };
    setCommitResult(body);
    setStep("done");
    router.refresh();
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Import inventory</h1>
        <Link href="/inventory" className="text-sm text-slate-500">
          Back
        </Link>
      </div>

      {step === "upload" && (
        <div className="space-y-4">
          <div className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-slate-100">
            <p className="text-sm font-medium text-slate-700">PDF or photo</p>
            <p className="text-sm text-slate-500">
              Upload a Seahub inventory export PDF or a single-page image. Claude
              vision parses the rows; you verify and edit before committing.
            </p>
            <input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
              disabled={loading}
              className="block w-full text-sm text-slate-700"
            />
          </div>

          <div className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-slate-100">
            <p className="text-sm font-medium text-slate-700">Spreadsheet</p>
            <p className="text-sm text-slate-500">
              Upload a CSV or Excel (.xlsx) file. The first row must be headers
              — columns like part name, make, qty, unit, location, supplier,
              unit price and critical threshold are matched automatically.
            </p>
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleSpreadsheet(f);
                e.target.value = "";
              }}
              disabled={loading}
              className="block w-full text-sm text-slate-700"
            />
          </div>

          {loading && <p className="text-sm text-slate-500">Reading…</p>}
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
            {rows.length} row(s) extracted. Edit anything that looks off, remove
            rows you do not want, then commit.
          </p>
          {extractError && (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {extractError}
            </p>
          )}
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li
                key={i}
                className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-slate-100"
              >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <input
                    value={r.part_name}
                    onChange={(e) => updateRow(i, { part_name: e.target.value })}
                    placeholder="Part name"
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                  />
                  <input
                    value={r.part_number ?? ""}
                    onChange={(e) => updateRow(i, { part_number: e.target.value || null })}
                    placeholder="Part #"
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                  />
                  <input
                    value={r.make ?? ""}
                    onChange={(e) => updateRow(i, { make: e.target.value || null })}
                    placeholder="Make"
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                  <input
                    type="number"
                    min="0"
                    value={r.quantity}
                    onChange={(e) => updateRow(i, { quantity: Math.max(0, Number(e.target.value || 0)) })}
                    placeholder="Qty"
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm tabular-nums"
                  />
                  <input
                    value={r.unit}
                    onChange={(e) => updateRow(i, { unit: e.target.value })}
                    placeholder="Unit"
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                  />
                  <input
                    value={r.location ?? ""}
                    onChange={(e) => updateRow(i, { location: e.target.value || null })}
                    placeholder="Location"
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm sm:col-span-2"
                  />
                  <select
                    value={r.component_ids[0] ?? ""}
                    onChange={(e) =>
                      updateRow(i, {
                        component_ids: e.target.value ? [e.target.value] : [],
                      })
                    }
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                    title="Pick the primary component. Add more on the item detail page after import."
                  >
                    <option value="">(component)</option>
                    {components.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    value={r.supplier ?? ""}
                    onChange={(e) => updateRow(i, { supplier: e.target.value || null })}
                    placeholder="Supplier"
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={r.unit_price ?? ""}
                    onChange={(e) =>
                      updateRow(i, {
                        unit_price: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    placeholder="Unit price (USD)"
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm tabular-nums"
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <label className="flex items-center gap-1">
                    Critical at
                    <input
                      type="number"
                      min="0"
                      value={r.critical_threshold ?? ""}
                      onChange={(e) =>
                        updateRow(i, {
                          critical_threshold: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className="ml-1 w-16 rounded-lg border border-slate-200 px-2 py-0.5 text-sm tabular-nums"
                    />
                  </label>
                  <button
                    onClick={() => removeRow(i)}
                    className="text-xs text-rose-600 hover:text-rose-800"
                  >
                    Remove row
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
            Commit {rows.length} row(s)
          </button>
        </div>
      )}

      {step === "committing" && (
        <p className="text-sm text-slate-500">Saving…</p>
      )}

      {step === "done" && commitResult && (
        <div className="space-y-3">
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Created {commitResult.created} of {commitResult.created + commitResult.failed}.
            {commitResult.failed > 0 && ` ${commitResult.failed} failed — check the server logs.`}
          </p>
          <Link
            href="/inventory"
            className="flex w-full items-center justify-center rounded-xl bg-slate-100 px-4 py-3 text-base font-medium text-slate-700 hover:bg-slate-200"
          >
            View inventory
          </Link>
        </div>
      )}
    </div>
  );
}
