"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Equipment, UserProfile } from "@/lib/types";

export interface MaintenanceTaskFormValues {
  equipment_id: string;
  title: string;
  description: string;
  priority: "" | "low" | "moderate" | "high" | "critical";
  due_type: "calendar" | "hours";
  interval_days: string;
  interval_hours: string;
  last_done_date: string;
  hours_at_last_done: string;
  assigned_to: string;
}

const inputClass =
  "mt-1 block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200";
const labelClass = "block text-sm font-medium text-slate-700";

export default function MaintenanceTaskForm({
  values,
  onChange,
  equipment,
  users,
}: {
  values: MaintenanceTaskFormValues;
  onChange: (patch: Partial<MaintenanceTaskFormValues>) => void;
  equipment: Pick<Equipment, "id" | "name">[];
  users: Pick<UserProfile, "id" | "full_name">[];
}) {
  // Due-type entry is a single "Repeat every [number] [Days/Hours]" control.
  // The underlying model is unchanged: Days writes interval_days + due_type
  // 'calendar', Hours writes interval_hours + due_type 'hours', and only one of
  // the two interval columns is ever set at a time.
  const unit = values.due_type === "calendar" ? "days" : "hours";
  const intervalValue =
    unit === "days" ? values.interval_days : values.interval_hours;

  function setIntervalValue(v: string) {
    onChange(unit === "days" ? { interval_days: v } : { interval_hours: v });
  }

  function setUnit(next: "days" | "hours") {
    if (next === unit) return;
    // Carry the typed number across the toggle and clear the now-unused field.
    if (next === "days") {
      onChange({
        due_type: "calendar",
        interval_days: intervalValue,
        interval_hours: "",
      });
    } else {
      onChange({
        due_type: "hours",
        interval_hours: intervalValue,
        interval_days: "",
      });
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="title" className={labelClass}>
          Title *
        </label>
        <input
          id="title"
          type="text"
          required
          value={values.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className={inputClass}
          placeholder="e.g. 5 Yearly Service"
        />
      </div>

      <div>
        <span className={labelClass}>Equipment *</span>
        <EquipmentTypeahead
          value={values.equipment_id}
          equipment={equipment}
          onChange={(id) => onChange({ equipment_id: id })}
        />
        <p className="mt-1 text-xs text-slate-400">
          Start typing to search. Type a new name and choose &quot;Add as
          new&quot; to create the unit on the fly.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="interval_value" className={labelClass}>
            Repeat every *
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="interval_value"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              required
              value={intervalValue}
              onChange={(e) => setIntervalValue(e.target.value)}
              className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
              placeholder={unit === "days" ? "e.g. 365" : "e.g. 250"}
            />
            <select
              aria-label="Interval unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value as "days" | "hours")}
              className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            >
              <option value="days">Days</option>
              <option value="hours">Hours</option>
            </select>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {unit === "days"
              ? "Calendar-based — due a number of days after it was last done."
              : "Hours-based — due once the unit runs this many hours past the last service."}
          </p>
        </div>
        <div>
          <label htmlFor="priority" className={labelClass}>
            Priority
          </label>
          <select
            id="priority"
            value={values.priority}
            onChange={(e) =>
              onChange({ priority: e.target.value as MaintenanceTaskFormValues["priority"] })
            }
            className={inputClass}
          >
            <option value="">(unset)</option>
            <option value="low">Low</option>
            <option value="moderate">Moderate</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {unit === "days" ? (
          <div>
            <label htmlFor="last_done_date" className={labelClass}>
              Last done date
            </label>
            <input
              id="last_done_date"
              type="date"
              value={values.last_done_date}
              onChange={(e) => onChange({ last_done_date: e.target.value })}
              className={inputClass}
            />
          </div>
        ) : (
          <div>
            <label htmlFor="hours_at_last_done" className={labelClass}>
              Hours at last done
            </label>
            <input
              id="hours_at_last_done"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={values.hours_at_last_done}
              onChange={(e) => onChange({ hours_at_last_done: e.target.value })}
              className={inputClass}
              placeholder="(blank if never done)"
            />
          </div>
        )}
        <div>
          <label htmlFor="assigned_to" className={labelClass}>
            Assigned to
          </label>
          <select
            id="assigned_to"
            value={values.assigned_to}
            onChange={(e) => onChange({ assigned_to: e.target.value })}
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
      </div>

      <div>
        <label htmlFor="description" className={labelClass}>
          Description
        </label>
        <textarea
          id="description"
          rows={3}
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className={inputClass}
        />
      </div>
    </div>
  );
}

// Single-select type-ahead for the task's equipment, modeled on
// ComponentMultiSelect: search the active equipment list, or type a name with
// no match and create the unit on the fly (POST /api/equipment with name only)
// so maintenance_tasks.equipment_id keeps its NOT NULL FK — which
// complete_maintenance_task() relies on to bump current_hours.
function EquipmentTypeahead({
  value,
  equipment,
  onChange,
}: {
  value: string;
  equipment: Pick<Equipment, "id" | "name">[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Local mirror so a just-created unit appears immediately, before any refresh.
  const [local, setLocal] = useState(equipment);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLocal(equipment);
  }, [equipment]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Close the dropdown on a click outside the wrapper.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const selected = useMemo(
    () => local.find((e) => e.id === value) ?? null,
    [local, value],
  );

  const available = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return local.filter((e) => (q ? e.name.toLowerCase().includes(q) : true));
  }, [local, filter]);

  const filterMatchesExisting = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return false;
    return local.some((e) => e.name.toLowerCase() === q);
  }, [filter, local]);
  const showCreate = filter.trim().length > 0 && !filterMatchesExisting;

  function pick(id: string) {
    onChange(id);
    setFilter("");
    setOpen(false);
  }

  async function createNew() {
    const name = filter.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        setCreateError("Couldn't add that equipment.");
        return;
      }
      const created = (await res.json()) as { id: string; name: string };
      setLocal((prev) =>
        prev.some((e) => e.id === created.id)
          ? prev
          : [...prev, { id: created.id, name: created.name }],
      );
      onChange(created.id);
      setFilter("");
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${inputClass} flex items-center justify-between text-left`}
      >
        <span className={selected ? "text-slate-900" : "text-slate-400"}>
          {selected
            ? selected.name
            : value
              ? "Selected equipment"
              : "Choose or type equipment…"}
        </span>
        <svg
          viewBox="0 0 20 20"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="ml-2 shrink-0 text-slate-400"
        >
          <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-slate-200">
          <input
            autoFocus
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search or type a new name…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (available.length > 0) {
                  e.preventDefault();
                  pick(available[0].id);
                } else if (showCreate) {
                  e.preventDefault();
                  void createNew();
                }
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            className="block w-full border-b border-slate-100 px-3 py-2 text-sm outline-none focus:bg-slate-50"
          />
          <div className="max-h-60 overflow-y-auto p-1">
            {available.length === 0 && !showCreate && (
              <p className="px-2 py-2 text-xs text-slate-400">No matches.</p>
            )}
            {available.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => pick(e.id)}
                className={`block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-100 ${
                  e.id === value
                    ? "bg-violet-50 font-medium text-violet-700"
                    : "text-slate-700"
                }`}
              >
                {e.name}
              </button>
            ))}
            {showCreate && (
              <button
                type="button"
                onClick={() => void createNew()}
                disabled={creating}
                className="block w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-60"
              >
                {creating
                  ? "Adding…"
                  : `+ Add "${filter.trim()}" as new equipment`}
              </button>
            )}
          </div>
          {createError && (
            <p className="border-t border-slate-100 px-3 py-2 text-xs text-rose-700">
              {createError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export const emptyTaskForm: MaintenanceTaskFormValues = {
  equipment_id: "",
  title: "",
  description: "",
  priority: "",
  due_type: "calendar",
  interval_days: "",
  interval_hours: "",
  last_done_date: "",
  hours_at_last_done: "",
  assigned_to: "",
};

export function taskFormToBody(v: MaintenanceTaskFormValues) {
  return {
    equipment_id: v.equipment_id,
    title: v.title.trim(),
    description: v.description.trim() || null,
    priority: v.priority || null,
    due_type: v.due_type,
    interval_days: v.due_type === "calendar"
      ? v.interval_days ? Number(v.interval_days) : null
      : null,
    interval_hours: v.due_type === "hours"
      ? v.interval_hours ? Number(v.interval_hours) : null
      : null,
    last_done_date: v.due_type === "calendar" ? (v.last_done_date || null) : null,
    hours_at_last_done:
      v.due_type === "hours" && v.hours_at_last_done !== ""
        ? Number(v.hours_at_last_done)
        : null,
    assigned_to: v.assigned_to || null,
  };
}
