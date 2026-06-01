"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MaintenanceTaskForm, {
  emptyTaskForm,
  taskFormToBody,
  type MaintenanceTaskFormValues,
} from "@/components/MaintenanceTaskForm";
import type { Equipment, MaintenanceTask, UserProfile } from "@/lib/types";

export default function MaintenanceTaskEditor({
  initial,
  equipment,
  users,
  defaultEquipmentId = null,
}: {
  initial: MaintenanceTask | null;
  equipment: Pick<Equipment, "id" | "name">[];
  users: Pick<UserProfile, "id" | "full_name">[];
  defaultEquipmentId?: string | null;
}) {
  const router = useRouter();
  const isEdit = initial != null;

  const [values, setValues] = useState<MaintenanceTaskFormValues>(
    initial
      ? {
          equipment_id: initial.equipment_id,
          title: initial.title,
          description: initial.description ?? "",
          priority: initial.priority ?? "",
          due_type: initial.due_type,
          interval_days: initial.interval_days != null ? String(initial.interval_days) : "",
          interval_hours: initial.interval_hours != null ? String(initial.interval_hours) : "",
          last_done_date: initial.last_done_date ?? "",
          hours_at_last_done: initial.hours_at_last_done != null ? String(initial.hours_at_last_done) : "",
          assigned_to: initial.assigned_to ?? "",
        }
      : { ...emptyTaskForm, equipment_id: defaultEquipmentId ?? "" },
  );

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!values.title.trim() || !values.equipment_id) {
      setError("Title and equipment are required.");
      return;
    }
    setSaving(true);
    setError(null);

    const res = await fetch(
      isEdit ? `/api/maintenance/tasks/${initial!.id}` : "/api/maintenance/tasks",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskFormToBody(values)),
      },
    );

    setSaving(false);
    if (!res.ok) {
      setError("Save failed. Please try again.");
      return;
    }
    router.push("/maintenance/tasks");
    router.refresh();
  }

  async function remove() {
    if (!initial) return;
    if (!confirm(`Delete "${initial.title}"? This can't be undone.`)) return;
    setDeleting(true);

    const res = await fetch(`/api/maintenance/tasks/${initial.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Delete failed. Please try again.");
      setDeleting(false);
      return;
    }
    router.push("/maintenance/tasks");
    router.refresh();
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">
          {isEdit ? `Edit · ${initial.title}` : "New maintenance task"}
        </h1>
        <Link href="/maintenance/tasks" className="text-sm text-slate-500">
          Back
        </Link>
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      <MaintenanceTaskForm
        values={values}
        onChange={(patch) => setValues((v) => ({ ...v, ...patch }))}
        equipment={equipment}
        users={users}
      />

      <button
        onClick={save}
        disabled={saving}
        className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
      >
        {saving ? "Saving…" : isEdit ? "Save changes" : "Create task"}
      </button>

      {isEdit && (
        <button
          onClick={remove}
          disabled={deleting}
          className="flex w-full items-center justify-center rounded-xl border border-rose-200 px-4 py-3 text-base font-medium text-rose-600 active:bg-rose-50 disabled:opacity-60"
        >
          {deleting ? "Deleting…" : "Delete task"}
        </button>
      )}
    </div>
  );
}
