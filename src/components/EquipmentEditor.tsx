"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import EquipmentForm, {
  emptyEquipmentForm,
  equipmentValuesToBody,
  type EquipmentFormValues,
} from "@/components/EquipmentForm";
import type { Component, Equipment, VesselZone } from "@/lib/types";

// A preventive-maintenance schedule typed inline while creating a new unit.
type PmDraft = { id: number; title: string; value: string; unit: "days" | "hours" };

const pmInput =
  "block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200";
const pmSmall =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200";

export default function EquipmentEditor({
  initial,
  components,
  zones,
}: {
  initial: Equipment | null;
  components: Component[];
  zones: VesselZone[];
}) {
  const router = useRouter();
  const isEdit = initial != null;

  const [values, setValues] = useState<EquipmentFormValues>(
    initial
      ? {
          name: initial.name,
          make: initial.make ?? "",
          model: initial.model ?? "",
          serial: initial.serial ?? "",
          location_on_vessel: initial.location_on_vessel ?? "",
          current_hours: initial.current_hours == null ? "" : String(initial.current_hours),
          component_id: initial.component_id ?? "",
          commissioned_date: initial.commissioned_date ?? "",
          image_paths:
            initial.image_paths && initial.image_paths.length > 0
              ? initial.image_paths
              : initial.image_path
                ? [initial.image_path]
                : [],
          critical: initial.critical ?? false,
          cost: initial.cost == null ? "" : String(initial.cost),
          ga_x: initial.ga_x ?? null,
          ga_y: initial.ga_y ?? null,
          notes: initial.notes ?? "",
        }
      : emptyEquipmentForm,
  );

  // Optional maintenance schedules entered while creating a new unit. Edit mode
  // doesn't show these — existing units manage PM from their detail page.
  const [pmDrafts, setPmDrafts] = useState<PmDraft[]>([]);
  const nextPmId = useRef(0);
  function addPm() {
    const id = nextPmId.current++;
    setPmDrafts((p) => [...p, { id, title: "", value: "", unit: "days" }]);
  }
  function updatePm(id: number, patch: Partial<PmDraft>) {
    setPmDrafts((p) => p.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }
  function removePm(id: number) {
    setPmDrafts((p) => p.filter((d) => d.id !== id));
  }

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!values.name.trim()) {
      setError("Name is required.");
      return;
    }

    // Validate any maintenance schedules typed alongside the new unit. Blank
    // rows are ignored; partially-filled rows are flagged.
    const pm = pmDrafts
      .map((d) => ({ title: d.title.trim(), value: d.value.trim(), unit: d.unit }))
      .filter((d) => d.title !== "" || d.value !== "");
    for (const d of pm) {
      if (!d.title || !(Number(d.value) > 0)) {
        setError(
          "Each maintenance schedule needs a title and an interval greater than 0 (or remove the empty row).",
        );
        return;
      }
    }

    setSaving(true);
    setError(null);

    const res = await fetch(isEdit ? `/api/equipment/${initial!.id}` : "/api/equipment", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(equipmentValuesToBody(values)),
    });

    if (!res.ok) {
      setSaving(false);
      setError("Save failed. Please try again.");
      return;
    }

    // On create, attach any maintenance schedules to the new unit, then land on
    // its detail page so the new tasks are visible.
    if (!isEdit && pm.length > 0) {
      const created = (await res.json()) as { id: string };
      const results = await Promise.all(
        pm.map((d) =>
          fetch("/api/maintenance/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              equipment_id: created.id,
              title: d.title,
              due_type: d.unit === "days" ? "calendar" : "hours",
              interval_days: d.unit === "days" ? Number(d.value) : null,
              interval_hours: d.unit === "hours" ? Number(d.value) : null,
            }),
          }).then((r) => r.ok),
        ),
      );
      const failed = results.filter((ok) => !ok).length;
      if (failed > 0) {
        alert(
          `Equipment saved, but ${failed} maintenance schedule${failed > 1 ? "s" : ""} didn't save. You can add ${failed > 1 ? "them" : "it"} from this unit's page.`,
        );
      }
      router.push(`/equipment/${created.id}`);
      router.refresh();
      return;
    }

    router.push("/equipment");
    router.refresh();
  }

  async function remove() {
    if (!initial) return;
    if (!confirm(`Delete ${initial.name}? This can't be undone.`)) return;
    setDeleting(true);

    const res = await fetch(`/api/equipment/${initial.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Delete failed. Please try again.");
      setDeleting(false);
      return;
    }
    router.push("/equipment");
    router.refresh();
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">
          {isEdit ? `Edit · ${initial.name}` : "New equipment"}
        </h1>
        <Link href="/equipment" className="text-sm text-slate-500">
          Back
        </Link>
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}
      <EquipmentForm
        values={values}
        onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
        components={components}
        zones={zones}
      />

      {!isEdit && (
        <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Preventive maintenance{" "}
              <span className="font-normal text-slate-400">(optional)</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Add service schedules for this unit now — or skip and add them later
              from its page.
            </p>
          </div>

          {pmDrafts.length > 0 && (
            <ul className="space-y-3">
              {pmDrafts.map((d) => (
                <li
                  key={d.id}
                  className="space-y-2 rounded-xl border border-slate-100 p-3"
                >
                  <input
                    type="text"
                    value={d.title}
                    onChange={(e) => updatePm(d.id, { title: e.target.value })}
                    placeholder="Task, e.g. Engine oil change"
                    className={pmInput}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-500">Repeat every</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={d.value}
                      onChange={(e) => updatePm(d.id, { value: e.target.value })}
                      placeholder={d.unit === "days" ? "365" : "250"}
                      className={`w-24 ${pmSmall}`}
                    />
                    <select
                      aria-label="Interval unit"
                      value={d.unit}
                      onChange={(e) =>
                        updatePm(d.id, { unit: e.target.value as "days" | "hours" })
                      }
                      className={pmSmall}
                    >
                      <option value="days">Days</option>
                      <option value="hours">Hours</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => removePm(d.id)}
                      className="ml-auto text-sm font-medium text-rose-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">
                    {d.unit === "days"
                      ? "Calendar-based — leave blank now; it'll show as due until first signed off."
                      : "Hours-based — comes due once the unit runs this many hours."}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={addPm}
            className="text-sm font-medium text-violet-700 hover:underline"
          >
            + Add a maintenance schedule
          </button>
        </section>
      )}

      <button
        onClick={save}
        disabled={saving}
        className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
      >
        {saving ? "Saving…" : isEdit ? "Save changes" : "Create equipment"}
      </button>

      {isEdit && (
        <button
          onClick={remove}
          disabled={deleting}
          className="flex w-full items-center justify-center rounded-xl border border-rose-200 px-4 py-3 text-base font-medium text-rose-600 active:bg-rose-50 disabled:opacity-60"
        >
          {deleting ? "Deleting…" : "Delete equipment"}
        </button>
      )}
    </div>
  );
}
