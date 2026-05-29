"use client";

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
        <label htmlFor="equipment_id" className={labelClass}>
          Equipment *
        </label>
        <select
          id="equipment_id"
          required
          value={values.equipment_id}
          onChange={(e) => onChange({ equipment_id: e.target.value })}
          className={inputClass}
        >
          <option value="" disabled>
            Choose equipment
          </option>
          {equipment.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="due_type" className={labelClass}>
            Due type *
          </label>
          <select
            id="due_type"
            value={values.due_type}
            onChange={(e) => onChange({ due_type: e.target.value as "calendar" | "hours" })}
            className={inputClass}
          >
            <option value="calendar">Calendar (days)</option>
            <option value="hours">Hours of operation</option>
          </select>
        </div>
        {values.due_type === "calendar" ? (
          <div>
            <label htmlFor="interval_days" className={labelClass}>
              Interval (days) *
            </label>
            <input
              id="interval_days"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              required
              value={values.interval_days}
              onChange={(e) => onChange({ interval_days: e.target.value })}
              className={inputClass}
              placeholder="e.g. 365"
            />
          </div>
        ) : (
          <div>
            <label htmlFor="interval_hours" className={labelClass}>
              Interval (hours) *
            </label>
            <input
              id="interval_hours"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              required
              value={values.interval_hours}
              onChange={(e) => onChange({ interval_hours: e.target.value })}
              className={inputClass}
              placeholder="e.g. 250"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {values.due_type === "calendar" ? (
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
