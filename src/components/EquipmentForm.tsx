"use client";

import type { Component, VesselZone } from "@/lib/types";
import PhotoGallery from "@/components/PhotoGallery";
import GaPinPicker from "@/components/GaPinPicker";

export interface EquipmentFormValues {
  name: string;
  make: string;
  model: string;
  serial: string;
  location_on_vessel: string;
  current_hours: string;
  component_id: string;
  commissioned_date: string;
  image_paths: string[];
  critical: boolean;
  ga_x: number | null;
  ga_y: number | null;
  notes: string;
}

const inputClass =
  "mt-1 block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200";
const labelClass = "block text-sm font-medium text-slate-700";

export default function EquipmentForm({
  values,
  onChange,
  components,
  zones,
}: {
  values: EquipmentFormValues;
  onChange: (patch: Partial<EquipmentFormValues>) => void;
  components: Component[];
  zones: VesselZone[];
}) {
  // A location string that isn't one of the managed vessel_zones names — e.g.
  // a legacy free-text value typed before this became a dropdown. We keep it
  // selectable so editing the unit doesn't wipe it.
  const loc = values.location_on_vessel.trim();
  const locationIsCustom =
    loc.length > 0 &&
    !zones.some((z) => z.name.toLowerCase() === loc.toLowerCase());

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
        <select
          id="location_on_vessel"
          value={values.location_on_vessel}
          onChange={(e) => onChange({ location_on_vessel: e.target.value })}
          className={inputClass}
        >
          <option value="">(none)</option>
          {zones.map((z) => (
            <option key={z.id} value={z.name}>
              {z.name}
            </option>
          ))}
          {/* Preserve a legacy/custom string that isn't one of the managed
              locations, so editing a unit never silently drops its location. */}
          {locationIsCustom && (
            <option value={values.location_on_vessel}>
              {values.location_on_vessel} (custom)
            </option>
          )}
        </select>
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
        <span className={labelClass}>Classification</span>
        <p className="mt-0.5 text-xs text-slate-400">
          Mark the unit for engineering priority.
        </p>
        <div className="mt-2">
          <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
            <input
              type="checkbox"
              checked={values.critical}
              onChange={(e) => onChange({ critical: e.target.checked })}
              className="h-4 w-4"
            />
            <span className="text-sm text-slate-700">Critical equipment</span>
          </label>
        </div>
      </div>

      <div>
        <span className={labelClass}>Pin on GA</span>
        <p className="mt-0.5 text-xs text-slate-400">
          Tap the spot on the vessel schematic where this unit lives. Used by
          the GA view so anyone can see at a glance what equipment is where.
        </p>
        <div className="mt-2">
          <GaPinPicker
            value={{ x: values.ga_x, y: values.ga_y }}
            onChange={(next) => onChange({ ga_x: next.x, ga_y: next.y })}
          />
        </div>
      </div>

      <div>
        <span className={labelClass}>Photos</span>
        <p className="mt-0.5 text-xs text-slate-400">
          The first photo is the hero. Star another to promote it. Useful
          shots: full unit, nameplate, serial sticker, control panel.
        </p>
        <div className="mt-2">
          <PhotoGallery
            values={values.image_paths}
            onChange={(next) => onChange({ image_paths: next })}
            bucket="equipment-photos"
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

export const emptyEquipmentForm: EquipmentFormValues = {
  name: "",
  make: "",
  model: "",
  serial: "",
  location_on_vessel: "",
  current_hours: "",
  component_id: "",
  commissioned_date: "",
  image_paths: [],
  critical: false,
  ga_x: null,
  ga_y: null,
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
    image_paths: v.image_paths,
    critical: v.critical,
    ga_x: v.ga_x,
    ga_y: v.ga_y,
    notes: v.notes.trim() || null,
  };
}
