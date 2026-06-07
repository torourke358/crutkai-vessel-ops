"use client";

import type { Component } from "@/lib/types";
import ComponentMultiSelect from "@/components/ComponentMultiSelect";
import PhotoCapture from "@/components/PhotoCapture";

export interface InventoryFormValues {
  part_name: string;
  part_number: string;
  make: string;
  quantity: string;          // string for the input; coerced on submit
  unit: string;
  location: string;
  component_ids: string[];
  location_photo_path: string | null;
  critical_threshold: string; // empty string = "no threshold"
  unit_price: string;         // empty string = unset
  supplier: string;
  lead_time_days: string;
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
          placeholder="e.g. Lightbulb case · electrical box under master"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="unit_price" className={labelClass}>
            Cost (USD)
          </label>
          <input
            id="unit_price"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="(unset)"
            value={values.unit_price}
            onChange={(e) => onChange({ unit_price: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="supplier" className={labelClass}>
            Supplier
          </label>
          <input
            id="supplier"
            type="text"
            value={values.supplier}
            onChange={(e) => onChange({ supplier: e.target.value })}
            className={inputClass}
            placeholder="e.g. Northern Lights"
          />
        </div>
        <div>
          <label htmlFor="lead_time_days" className={labelClass}>
            Lead time (days)
          </label>
          <input
            id="lead_time_days"
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            placeholder="(unknown)"
            value={values.lead_time_days}
            onChange={(e) => onChange({ lead_time_days: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <span className={labelClass}>Location photo</span>
        <p className="mt-0.5 text-xs text-slate-400">
          Snap a quick photo of where this part lives so crew can find it later.
        </p>
        <div className="mt-2">
          <PhotoCapture
            value={values.location_photo_path}
            onChange={(next) => onChange({ location_photo_path: next })}
            bucket="inventory-photos"
            alt="Location"
          />
        </div>
      </div>

      <div>
        <span className={labelClass}>Related components</span>
        <p className="mt-0.5 text-xs text-slate-400">
          Pick up to 8 related components.
        </p>
        <div className="mt-2">
          <ComponentMultiSelect
            value={values.component_ids}
            onChange={(next) => onChange({ component_ids: next })}
            components={components}
          />
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

export const emptyInventoryForm: InventoryFormValues = {
  part_name: "",
  part_number: "",
  make: "",
  quantity: "0",
  unit: "Units",
  location: "",
  component_ids: [],
  location_photo_path: null,
  critical_threshold: "",
  unit_price: "",
  supplier: "",
  lead_time_days: "",
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
    component_ids: v.component_ids,
    location_photo_path: v.location_photo_path,
    critical_threshold: v.critical_threshold === "" ? null : Number(v.critical_threshold),
    unit_price: v.unit_price === "" ? null : Number(v.unit_price),
    supplier: v.supplier.trim() || null,
    lead_time_days: v.lead_time_days === "" ? null : Number(v.lead_time_days),
    notes: v.notes.trim() || null,
  };
}
