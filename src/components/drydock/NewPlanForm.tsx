"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PhotoGallery from "@/components/PhotoGallery";
import type { YardPeriod } from "@/lib/types";

// Step 1 of the dry-dock planner: name the area, snap photos of it (multi-
// photo, straight into the private disassembly-photos bucket), then have
// Claude vision produce the disassembly order. Redirects to the plan page.
export default function NewPlanForm({ periods }: { periods: YardPeriod[] }) {
  const router = useRouter();
  const [areaName, setAreaName] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!areaName.trim()) {
      setError("Name the area first (e.g. Engine room).");
      return;
    }
    if (photoPaths.length === 0) {
      setError("Add at least one photo of the area.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/drydock/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          area_name: areaName.trim(),
          yard_period_id: periodId || null,
          photo_paths: photoPaths,
        }),
      });
      const body = await res.json();
      if (!res.ok || body.error) {
        setError(
          body.error === "parse_failed"
            ? "The AI response couldn't be read — try again."
            : "Plan generation failed.",
        );
        return;
      }
      router.push(`/yard/planner/${body.plan.id}`);
      router.refresh();
    } catch {
      setError("Plan generation failed.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1 block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200";

  return (
    <div className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-slate-100">
      <p className="text-sm text-slate-500">
        Photograph an area before the yard period (engine room, lazarette,
        flybridge…). Claude looks at what&apos;s installed and orders the
        disassembly so nothing blocks the job halfway — anything needing an
        outside contractor gets flagged to book first.
      </p>

      <div>
        <label className="block text-sm font-medium text-slate-700">Area *</label>
        <input
          value={areaName}
          onChange={(e) => setAreaName(e.target.value)}
          placeholder="e.g. Engine room"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">
          Yard period (optional)
        </label>
        <select
          value={periodId}
          onChange={(e) => setPeriodId(e.target.value)}
          className={inputClass}
        >
          <option value="">(none yet)</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Photos of the area *
        </label>
        <PhotoGallery
          values={photoPaths}
          onChange={setPhotoPaths}
          bucket="disassembly-photos"
        />
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      )}

      <button
        onClick={generate}
        disabled={busy}
        className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
      >
        {busy ? "Analyzing photos…" : "Generate plan"}
      </button>
    </div>
  );
}
