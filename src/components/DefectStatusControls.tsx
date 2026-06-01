"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUS_LABELS,
  type Defect,
  type DefectSeverity,
  type DefectStatus,
  type Equipment,
  type UserProfile,
} from "@/lib/types";

export default function DefectStatusControls({
  defect,
  users,
  equipment,
}: {
  defect: Defect;
  users: Pick<UserProfile, "id" | "full_name">[];
  equipment: Pick<Equipment, "id" | "name">[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<DefectStatus>(defect.status);
  const [severity, setSeverity] = useState<DefectSeverity>(defect.severity);
  const [assignedTo, setAssignedTo] = useState(defect.assigned_to ?? "");
  const [equipmentId, setEquipmentId] = useState(defect.equipment_id ?? "");
  const [resolution, setResolution] = useState(defect.resolution ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/defects/${defect.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Save failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs uppercase tracking-wide text-slate-500">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => {
              const v = e.target.value as DefectStatus;
              setStatus(v);
              void save({ status: v });
            }}
            disabled={busy}
            className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
          >
            {(Object.entries(DEFECT_STATUS_LABELS) as [DefectStatus, string][]).map(
              ([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ),
            )}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wide text-slate-500">
            Severity
          </label>
          <select
            value={severity}
            onChange={(e) => {
              const v = e.target.value as DefectSeverity;
              setSeverity(v);
              void save({ severity: v });
            }}
            disabled={busy}
            className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
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
          <label className="block text-xs uppercase tracking-wide text-slate-500">
            Assigned to
          </label>
          <select
            value={assignedTo}
            onChange={(e) => {
              setAssignedTo(e.target.value);
              void save({ assigned_to: e.target.value || null });
            }}
            disabled={busy}
            className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
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
          <label className="block text-xs uppercase tracking-wide text-slate-500">
            Equipment
          </label>
          <select
            value={equipmentId}
            onChange={(e) => {
              setEquipmentId(e.target.value);
              void save({ equipment_id: e.target.value || null });
            }}
            disabled={busy}
            className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">(none)</option>
            {equipment.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {status === "resolved" && (
        <div>
          <label className="block text-xs uppercase tracking-wide text-slate-500">
            Resolution notes
          </label>
          <textarea
            rows={3}
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            onBlur={() => save({ resolution: resolution.trim() || null })}
            placeholder="How was this fixed? Parts used? Tested how?"
            className="mt-1 block w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
          />
        </div>
      )}
    </div>
  );
}
