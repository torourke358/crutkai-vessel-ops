"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PhotoGallery from "@/components/PhotoGallery";
import {
  DEFECT_SEVERITY_LABELS,
  type DefectSeverity,
  type Equipment,
  type UserProfile,
} from "@/lib/types";

const inputClass =
  "mt-1 block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200";
const labelClass = "block text-sm font-medium text-slate-700";

export default function DefectForm({
  equipment,
  users,
}: {
  equipment: Pick<Equipment, "id" | "name">[];
  users: Pick<UserProfile, "id" | "full_name">[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<DefectSeverity>("normal");
  const [equipmentId, setEquipmentId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/defects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || null,
        severity,
        equipment_id: equipmentId || null,
        assigned_to: assignedTo || null,
        image_paths: imagePaths,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Save failed.");
      return;
    }
    router.push("/defects");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div>
        <label className={labelClass}>Title *</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="e.g. Port engine raw water pump leaking"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Severity</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as DefectSeverity)}
            className={inputClass}
          >
            {(Object.entries(DEFECT_SEVERITY_LABELS) as [DefectSeverity, string][]).map(
              ([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ),
            )}
          </select>
        </div>
        <div>
          <label className={labelClass}>Equipment (optional)</label>
          <select
            value={equipmentId}
            onChange={(e) => setEquipmentId(e.target.value)}
            className={inputClass}
          >
            <option value="">(none)</option>
            {equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Assigned to (optional)</label>
        <select
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
          className={inputClass}
        >
          <option value="">(unassigned)</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name ?? u.id}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <textarea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What did you find? Where? What did you try?"
          className={inputClass}
        />
      </div>

      <div>
        <span className={labelClass}>Photos</span>
        <p className="mt-0.5 text-xs text-slate-400">
          Multiple shots help — first photo becomes the hero on the list.
        </p>
        <div className="mt-2">
          <PhotoGallery
            values={imagePaths}
            onChange={setImagePaths}
            bucket="equipment-photos"
          />
        </div>
      </div>

      <button
        onClick={save}
        disabled={busy}
        className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-base font-medium text-white hover:bg-violet-700 disabled:opacity-60"
      >
        {busy ? "Saving…" : "Log defect"}
      </button>
    </div>
  );
}
