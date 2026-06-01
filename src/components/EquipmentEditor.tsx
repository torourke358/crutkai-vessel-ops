"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import EquipmentForm, {
  emptyEquipmentForm,
  equipmentValuesToBody,
  type EquipmentFormValues,
} from "@/components/EquipmentForm";
import type { Component, Equipment, VesselZone } from "@/lib/types";

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
          zone_id: initial.zone_id ?? "",
          commissioned_date: initial.commissioned_date ?? "",
          image_paths:
            initial.image_paths && initial.image_paths.length > 0
              ? initial.image_paths
              : initial.image_path
                ? [initial.image_path]
                : [],
          critical: initial.critical ?? false,
          is_ism: initial.is_ism ?? false,
          is_isps: initial.is_isps ?? false,
          ga_x: initial.ga_x ?? null,
          ga_y: initial.ga_y ?? null,
          notes: initial.notes ?? "",
        }
      : emptyEquipmentForm,
  );

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!values.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);

    const res = await fetch(isEdit ? `/api/equipment/${initial!.id}` : "/api/equipment", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(equipmentValuesToBody(values)),
    });

    setSaving(false);
    if (!res.ok) {
      setError("Save failed. Please try again.");
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
