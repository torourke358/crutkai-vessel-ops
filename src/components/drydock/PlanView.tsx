"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { DisassemblyPlan, DisassemblyStep, YardPeriod } from "@/lib/types";

// Ordered, editable view of an AI-generated disassembly plan. Steps can be
// reordered / edited / deleted while the plan is a draft; blocking steps get
// a red "book contractor first" badge with the lead-time callout. Converting
// creates one yard task per step and freezes the plan.

type EditableStep = Omit<DisassemblyStep, "id" | "plan_id"> & { key: string };

function toEditable(s: DisassemblyStep): EditableStep {
  const { id: _id, plan_id: _planId, ...rest } = s;
  void _id;
  void _planId;
  return { ...rest, key: crypto.randomUUID() };
}

export default function PlanView({
  plan,
  initialSteps,
  periods,
}: {
  plan: DisassemblyPlan;
  initialSteps: DisassemblyStep[];
  periods: YardPeriod[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [steps, setSteps] = useState<EditableStep[]>(initialSteps.map(toEditable));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [convertPeriodId, setConvertPeriodId] = useState(plan.yard_period_id ?? "");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  const editable = plan.status !== "converted";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const urls: string[] = [];
      for (const p of plan.photo_paths) {
        const { data } = await supabase.storage
          .from("disassembly-photos")
          .createSignedUrl(p, 300);
        if (data?.signedUrl) urls.push(data.signedUrl);
      }
      if (!cancelled) setPhotoUrls(urls);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.photo_paths.join("|")]);

  function mutate(fn: (prev: EditableStep[]) => EditableStep[]) {
    setSteps(fn);
    setDirty(true);
    setMessage(null);
  }

  // Renumber 1..n and remap depends_on_seqs after any structural change.
  function renumber(list: EditableStep[], oldSeqToNew: Map<number, number>): EditableStep[] {
    return list.map((s, i) => ({
      ...s,
      seq: i + 1,
      depends_on_seqs: s.depends_on_seqs
        .map((d) => oldSeqToNew.get(d))
        .filter((d): d is number => d != null && d !== i + 1),
    }));
  }

  function move(idx: number, dir: -1 | 1) {
    mutate((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      const map = new Map<number, number>();
      next.forEach((s, i) => map.set(s.seq, i + 1));
      return renumber(next, map);
    });
  }

  function removeStep(idx: number) {
    mutate((prev) => {
      const removedSeq = prev[idx].seq;
      const next = prev.filter((_, i) => i !== idx);
      const map = new Map<number, number>();
      next.forEach((s, i) => map.set(s.seq, i + 1));
      map.delete(removedSeq);
      return renumber(next, map);
    });
  }

  function updateStep(idx: number, patch: Partial<EditableStep>) {
    mutate((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  async function saveSteps() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/drydock/plans/${plan.id}/steps`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        steps: steps.map(({ key: _key, ...s }) => {
          void _key;
          return s;
        }),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Save failed.");
      return;
    }
    setDirty(false);
    setMessage("Steps saved.");
    router.refresh();
  }

  async function finalize() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/drydock/plans/${plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "final" }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Finalize failed.");
      return;
    }
    setMessage("Plan finalized.");
    router.refresh();
  }

  async function convert() {
    if (!convertPeriodId) {
      setError("Pick a yard period to create the tasks in.");
      return;
    }
    if (dirty) {
      setError("Save your step edits first.");
      return;
    }
    if (!confirm("Create one yard task per step? The plan locks afterwards.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/drydock/plans/${plan.id}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yard_period_id: convertPeriodId }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError("Convert failed.");
      return;
    }
    setMessage(`Created ${body?.created ?? 0} yard task(s).`);
    router.push(`/yard/${convertPeriodId}`);
    router.refresh();
  }

  async function removePlan() {
    if (!confirm(`Delete the "${plan.area_name}" plan and its steps?`)) return;
    setBusy(true);
    const res = await fetch(`/api/drydock/plans/${plan.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError("Delete failed.");
      return;
    }
    router.push("/yard/planner");
    router.refresh();
  }

  const blockers = steps.filter((s) => s.is_blocking);
  const smallInput = "rounded-lg border border-slate-200 px-2 py-1 text-sm";

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{plan.area_name}</h1>
          <p className="text-sm text-slate-500">
            Disassembly plan · {plan.status}
            {plan.model && <span> · {plan.model}</span>}
          </p>
        </div>
        <Link href="/yard/planner" className="text-sm text-slate-500">
          Back
        </Link>
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {message && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>
      )}

      {photoUrls.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photoUrls.map((u, i) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={i}
              src={u}
              alt={`Area photo ${i + 1}`}
              className="aspect-square w-full rounded-xl object-cover ring-1 ring-slate-200"
            />
          ))}
        </div>
      )}

      {plan.summary && (
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
          <p className="text-sm whitespace-pre-wrap text-slate-700">{plan.summary}</p>
        </div>
      )}

      {blockers.length > 0 && (
        <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-100">
          <p className="text-sm font-semibold text-rose-800">
            Book before work begins
          </p>
          <ul className="mt-1 space-y-1 text-sm text-rose-700">
            {blockers.map((s) => (
              <li key={s.key}>
                #{s.seq} {s.title}
                {s.external_contractor && <span> — {s.external_contractor}</span>}
                {s.contractor_lead_time_days != null && (
                  <span> (~{s.contractor_lead_time_days} day lead time)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.key} className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
            <div className="flex items-start gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-100 text-sm font-bold text-violet-700">
                {s.seq}
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                {editable ? (
                  <input
                    value={s.title}
                    onChange={(e) => updateStep(i, { title: e.target.value })}
                    className={`${smallInput} w-full font-semibold`}
                  />
                ) : (
                  <p className="font-semibold text-slate-900">{s.title}</p>
                )}

                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {s.equipment_label && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                      {s.equipment_label}
                    </span>
                  )}
                  {s.depends_on_seqs.map((d) => (
                    <span
                      key={d}
                      className="rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-800"
                    >
                      after #{d}
                    </span>
                  ))}
                  {s.est_hours != null && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700 tabular-nums">
                      ~{s.est_hours}h
                    </span>
                  )}
                  {s.is_blocking && (
                    <span className="rounded-full bg-rose-600 px-2 py-0.5 font-semibold text-white">
                      BLOCKING — book contractor first
                    </span>
                  )}
                </div>

                {s.is_blocking && (s.external_contractor || s.contractor_lead_time_days != null) && (
                  <p className="text-xs font-medium text-rose-700">
                    {s.external_contractor ?? "External contractor"}
                    {s.contractor_lead_time_days != null &&
                      ` · ~${s.contractor_lead_time_days} day scheduling lead time`}
                  </p>
                )}

                {editable ? (
                  <textarea
                    rows={2}
                    value={s.description ?? ""}
                    onChange={(e) => updateStep(i, { description: e.target.value || null })}
                    placeholder="Description"
                    className={`${smallInput} w-full`}
                  />
                ) : (
                  s.description && (
                    <p className="text-sm whitespace-pre-wrap text-slate-600">{s.description}</p>
                  )
                )}

                {s.flag_reason && (
                  <p className="text-xs text-slate-500">{s.flag_reason}</p>
                )}
              </div>

              {editable && (
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0 || busy}
                    aria-label="Move up"
                    className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200 disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === steps.length - 1 || busy}
                    aria-label="Move down"
                    className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200 disabled:opacity-40"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => removeStep(i)}
                    disabled={busy}
                    aria-label="Delete step"
                    className="rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      {editable && (
        <div className="space-y-3">
          {dirty && (
            <button
              onClick={saveSteps}
              disabled={busy || steps.length === 0}
              className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save step changes"}
            </button>
          )}

          {plan.status === "draft" && !dirty && (
            <button
              onClick={finalize}
              disabled={busy}
              className="flex w-full items-center justify-center rounded-xl bg-white px-4 py-3 text-base font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-60"
            >
              Mark plan final
            </button>
          )}

          <div className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
            <p className="text-sm font-medium text-slate-700">Convert to yard tasks</p>
            <p className="text-xs text-slate-500">
              Creates one task per step in the period&apos;s Engineering quadrant,
              numbered in disassembly order. Blocking steps land as
              &quot;Fires&quot; urgency.
            </p>
            <select
              value={convertPeriodId}
              onChange={(e) => setConvertPeriodId(e.target.value)}
              className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            >
              <option value="">(choose yard period)</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={convert}
              disabled={busy || !convertPeriodId}
              className="flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
            >
              {busy ? "Working…" : `Convert ${steps.length} step(s) to yard tasks`}
            </button>
          </div>

          <button
            onClick={removePlan}
            disabled={busy}
            className="flex w-full items-center justify-center rounded-xl border border-rose-200 px-4 py-3 text-base font-medium text-rose-600 active:bg-rose-50 disabled:opacity-60"
          >
            Delete plan
          </button>
        </div>
      )}

      {!editable && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          This plan was converted to yard tasks
          {plan.yard_period_id && (
            <>
              {" — "}
              <Link href={`/yard/${plan.yard_period_id}`} className="font-medium underline">
                open the yard period
              </Link>
            </>
          )}
          .
        </p>
      )}
    </div>
  );
}
