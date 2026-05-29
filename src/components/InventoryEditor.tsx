"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import InventoryForm, {
  emptyInventoryForm,
  formValuesToBody,
  type InventoryFormValues,
} from "@/components/InventoryForm";
import type { Component, InventoryItem } from "@/lib/types";

export default function InventoryEditor({
  initial,
  components,
}: {
  // Pass `null` for the create flow, an existing row for edit.
  initial: InventoryItem | null;
  components: Component[];
}) {
  const router = useRouter();
  const isEdit = initial != null;

  const [values, setValues] = useState<InventoryFormValues>(
    initial
      ? {
          part_name: initial.part_name,
          part_number: initial.part_number ?? "",
          make: initial.make ?? "",
          quantity: String(initial.quantity),
          unit: initial.unit,
          location: initial.location ?? "",
          related_component_id: initial.related_component_id ?? "",
          critical_threshold:
            initial.critical_threshold == null ? "" : String(initial.critical_threshold),
          notes: initial.notes ?? "",
        }
      : emptyInventoryForm,
  );

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    if (!values.part_name.trim()) {
      setError("Part name is required.");
      return;
    }
    setSaving(true);
    setError(null);

    const url = isEdit ? `/api/inventory/${initial!.id}` : "/api/inventory";
    const method = isEdit ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formValuesToBody(values)),
    });

    setSaving(false);
    if (!res.ok) {
      setError("Save failed. Please try again.");
      return;
    }

    if (isEdit) {
      setMessage("Saved.");
      router.refresh();
    } else {
      router.push("/inventory");
      router.refresh();
    }
  }

  async function remove() {
    if (!initial) return;
    if (!confirm(`Delete ${initial.part_name}? This can't be undone.`)) return;
    setDeleting(true);
    setError(null);

    const res = await fetch(`/api/inventory/${initial.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Delete failed. Please try again.");
      setDeleting(false);
      return;
    }
    router.push("/inventory");
    router.refresh();
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">
          {isEdit ? initial.part_name : "New inventory item"}
        </h1>
        <Link href="/inventory" className="text-sm text-slate-500">
          Back
        </Link>
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

      <InventoryForm
        values={values}
        onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
        components={components}
      />

      <button
        onClick={save}
        disabled={saving}
        className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
      >
        {saving ? "Saving…" : isEdit ? "Save changes" : "Create item"}
      </button>

      {isEdit && (
        <button
          onClick={remove}
          disabled={deleting}
          className="flex w-full items-center justify-center rounded-xl border border-rose-200 px-4 py-3 text-base font-medium text-rose-600 active:bg-rose-50 disabled:opacity-60"
        >
          {deleting ? "Deleting…" : "Delete item"}
        </button>
      )}
    </div>
  );
}
