"use client";

import type { Component } from "@/lib/types";

export interface EquipmentFormValues {
  name: string;
  make: string;
  model: string;
  serial: string;
  location_on_vessel: string;
  current_hours: string;
  component_id: string;
  commissioned_date: string;
  notes: string;
}

const inputClass =
  "mt-1 block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200";
const labelClass = "block text-sm font-medium text-slate-700";

export default function EquipmentForm({
  values,
  onChange,
  components,
}: {
  values: EquipmentFormValues;
  onChange: (patch: Partial<EquipmentFormValues>) => void;
  components: Component[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="name" className={labelClass}>
          Name *
        </label>
        <input
          id="name"
          type="text"
          required
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className={inputClass}
          placeholder="e.g. Gearbox (Port)"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="make" className={labelClass}>
            Make
          </label>
          <input
            id="make"
            type="text"
            value={values.make}
            onChange={(e) => onChange({ make: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="model" className={labelClass}>
            Model
          </label>
          <input
            id="model"
            type="text"
            value={values.model}
            onChange={(e) => onChange({ model: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="serial" className={labelClass}>
            Serial number
          </label>
          <input
            id="serial"
            type="text"
            value={values.serial}
            onChange={(e) => onChange({ serial: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="current_hours" className={labelClass}>
            Current hours
          </label>
          <input
            id="current_hours"
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            value={values.current_hours}
            onChange={(e) => onChange({ current_hours: e.target.value })}
            className={inputClass}
            placeholder="(leave blank if unknown)"
          />
        </div>
      </div>

      <div>
        <label htmlFor="location_on_vessel" className={labelClass}>
          Location on vessel
        </label>
        <input
          id="location_on_vessel"
          type="text"
          value={values.location_on_vessel}
          onChange={(e) => onChange({ location_on_vessel: e.target.value })}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="component_id" className={labelClass}>
            System
          </label>
          <select
            id="component_id"
            value={values.component_id}
            onChange={(e) => onChange({ component_id: e.target.value })}
            className={inputClass}
          >
            <option value="">(none)</option>
            {components.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="commissioned_date" className={labelClass}>
            Commissioned
          </label>
          <input
            id="commissioned_date"
            type="date"
            value={values.commissioned_date}
            onChange={(e) => onChange({ commissioned_date: e.target.value })}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-slate-400">
            When the unit first went into service (may pre-date when you
            started tracking it in Thor).
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="notes" className={labelClass}>
          Notes
        </label>
        <textarea
          id="notes"
          rows={3}
          value={values.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          className={inputClass}
        />
      </div>
    </div>
  );
}

export const emptyEquipmentForm: EquipmentFormValues = {
  name: "",
  make: "",
  model: "",
  serial: "",
  location_on_vessel: "",
  current_hours: "",
  component_id: "",
  commissioned_date: "",
  notes: "",
};

export function equipmentValuesToBody(v: EquipmentFormValues) {
  return {
    name: v.name.trim(),
    make: v.make.trim() || null,
    model: v.model.trim() || null,
    serial: v.serial.trim() || null,
    location_on_vessel: v.location_on_vessel.trim() || null,
    current_hours: v.current_hours === "" ? null : Number(v.current_hours),
    component_id: v.component_id || null,
    commissioned_date: v.commissioned_date || null,
    notes: v.notes.trim() || null,
  };
}
