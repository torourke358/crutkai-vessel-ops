"use client";

import type { Component } from "@/lib/types";

export interface InventoryFormValues {
  part_name: string;
  part_number: string;
  make: string;
  quantity: string;          // string for the input; coerced on submit
  unit: string;
  location: string;
  related_component_id: string;
  critical_threshold: string; // empty string = "no threshold"
  notes: string;
}

const inputClass =
  "mt-1 block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200";
const labelClass = "block text-sm font-medium text-slate-700";

export default function InventoryForm({
  values,
  onChange,
  components,
}: {
  values: InventoryFormValues;
  onChange: (patch: Partial<InventoryFormValues>) => void;
  components: Component[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="part_name" className={labelClass}>
          Part name *
        </label>
        <input
          id="part_name"
          type="text"
          required
          value={values.part_name}
          onChange={(e) => onChange({ part_name: e.target.value })}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="part_number" className={labelClass}>
            Part number
          </label>
          <input
            id="part_number"
            type="text"
            value={values.part_number}
            onChange={(e) => onChange({ part_number: e.target.value })}
            className={inputClass}
          />
        </div>
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
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <label htmlFor="quantity" className={labelClass}>
            Quantity *
          </label>
          <input
            id="quantity"
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            required
            value={values.quantity}
            onChange={(e) => onChange({ quantity: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="unit" className={labelClass}>
            Unit
          </label>
          <input
            id="unit"
            type="text"
            value={values.unit}
            onChange={(e) => onChange({ unit: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="critical_threshold" className={labelClass}>
            Critical at
          </label>
          <input
            id="critical_threshold"
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            placeholder="(no alert)"
            value={values.critical_threshold}
            onChange={(e) => onChange({ critical_threshold: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="location" className={labelClass}>
          Location on vessel
        </label>
        <input
          id="location"
          type="text"
          value={values.location}
          onChange={(e) => onChange({ location: e.target.value })}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="related_component_id" className={labelClass}>
          Related component
        </label>
        <select
          id="related_component_id"
          value={values.related_component_id}
          onChange={(e) => onChange({ related_component_id: e.target.value })}
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

export const emptyInventoryForm: InventoryFormValues = {
  part_name: "",
  part_number: "",
  make: "",
  quantity: "0",
  unit: "Units",
  location: "",
  related_component_id: "",
  critical_threshold: "",
  notes: "",
};

// Build the JSON body expected by the inventory API from form values.
export function formValuesToBody(v: InventoryFormValues) {
  return {
    part_name: v.part_name.trim(),
    part_number: v.part_number.trim() || null,
    make: v.make.trim() || null,
    quantity: Number(v.quantity || 0),
    unit: v.unit.trim() || "Units",
    location: v.location.trim() || null,
    related_component_id: v.related_component_id || null,
    critical_threshold: v.critical_threshold === "" ? null : Number(v.critical_threshold),
    notes: v.notes.trim() || null,
  };
}
