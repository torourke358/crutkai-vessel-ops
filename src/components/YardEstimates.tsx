"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { prepareImage } from "@/lib/image";
import { formatAmount, formatDate } from "@/lib/format";
import {
  YARD_ESTIMATE_STATUS_LABELS,
  YARD_TRADES,
  type AiConfidence,
  type VesselZone,
  type YardCurrency,
  type YardEstimate,
  type YardEstimateStatus,
  type YardInvoice,
  type YardPayment,
  type YardVendor,
} from "@/lib/types";
import { rollUpEstimate } from "@/lib/yard-money";

// Estimates: the list, and the capture-and-check flow that fills it.
//
// The capture flow is the petty cash receipt flow retold for a quote — photo,
// read, CHECK, save — with one difference that matters: an estimate's line
// items come back as jobs, so pressing save writes the money record and puts
// the work on the board and the timeline in one go.
//
// Nothing is ever saved from the extraction alone. Every field is editable and
// the save button is the human's, not the model's.

const BUCKET = "yard-documents";

type Stage = "list" | "uploading" | "reading" | "verify";

interface DraftJob {
  title: string;
  amount: number | null;
  zone_id: string | null;
  trade: string | null;
  include: boolean;
}

interface Draft {
  vendor_id: string | null;
  vendor_name: string;
  title: string;
  reference: string;
  amount: string;
  currency: YardCurrency;
  start_date: string;
  end_date: string;
  status: YardEstimateStatus;
  notes: string;
  jobs: DraftJob[];
}

const EMPTY: Draft = {
  vendor_id: null,
  vendor_name: "",
  title: "",
  reference: "",
  amount: "",
  currency: "USD",
  start_date: "",
  end_date: "",
  status: "draft",
  notes: "",
  jobs: [],
};

export default function YardEstimates({
  periodId,
  periodStart,
  periodEnd,
  estimates,
  invoices,
  payments,
  vendors,
  zones,
}: {
  periodId: string;
  periodStart: string;
  periodEnd: string | null;
  estimates: YardEstimate[];
  invoices: YardInvoice[];
  payments: YardPayment[];
  vendors: YardVendor[];
  zones: VesselZone[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [stage, setStage] = useState<Stage>("list");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [docPath, setDocPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<AiConfidence | null>(null);
  const [rawExtraction, setRawExtraction] = useState<unknown>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);

  const vendorByName = new Map(vendors.map((v) => [v.name.trim().toLowerCase(), v]));
  const zoneByName = new Map(zones.map((z) => [z.name.trim().toLowerCase(), z]));

  function startManual() {
    setDocPath(null);
    setPreview(null);
    setConfidence(null);
    setRawExtraction(null);
    setError(null);
    setDraft({ ...EMPTY, start_date: periodStart, end_date: periodEnd ?? "" });
    setStage("verify");
  }

  async function handleFile(file: File) {
    setError(null);
    setNotice(null);
    setStage("uploading");
    try {
      const prepared = await prepareImage(file);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("You're signed out. Sign in and try again.");
        setStage("list");
        return;
      }
      const path = `${user.id}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, prepared, { contentType: "image/jpeg" });
      if (upErr) {
        setError(`Couldn't upload the photo: ${upErr.message}`);
        setStage("list");
        return;
      }
      setDocPath(path);
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
      setPreview(signed?.signedUrl ?? null);

      setStage("reading");
      const res = await fetch("/api/yard/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "estimate",
          image_path: path,
          zones: zones.map((z) => z.name),
          trades: [...YARD_TRADES],
        }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok || !body || body.error) {
        // Deliberately not fatal — the photo is saved, so fall through to the
        // form with it attached and let the numbers be typed in by hand.
        setNotice(
          "We couldn't read this one. The photo is attached — fill in the details by hand.",
        );
        setDraft({ ...EMPTY, start_date: periodStart, end_date: periodEnd ?? "" });
        setStage("verify");
        return;
      }
      applyExtraction(body.extraction);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that image.");
      setStage("list");
    }
  }

  function applyExtraction(x: unknown) {
    const e = (x ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

    const vendorName = str(e.vendor);
    const matched = vendorByName.get(vendorName.toLowerCase());

    const rawJobs = Array.isArray(e.jobs) ? e.jobs : [];
    const jobs: DraftJob[] = rawJobs.slice(0, 200).map((j) => {
      const job = (j ?? {}) as Record<string, unknown>;
      const zoneName = str(job.zone);
      const trade = str(job.trade).toLowerCase();
      return {
        title: str(job.title) || "Untitled job",
        amount: num(job.amount),
        zone_id: zoneByName.get(zoneName.toLowerCase())?.id ?? null,
        trade: (YARD_TRADES as readonly string[]).includes(trade) ? trade : null,
        include: true,
      };
    });

    const conf = str(e.confidence).toLowerCase();
    setConfidence(conf === "high" || conf === "medium" || conf === "low" ? conf : null);
    setRawExtraction(x);
    setDraft({
      vendor_id: matched?.id ?? null,
      vendor_name: vendorName,
      title: str(e.title) || (vendorName ? `${vendorName} — refit work` : ""),
      reference: str(e.reference),
      amount: num(e.amount) != null ? String(num(e.amount)) : "",
      currency: (["USD", "EUR", "GBP", "CAD", "AUD"] as const).includes(
        str(e.currency).toUpperCase() as YardCurrency,
      )
        ? (str(e.currency).toUpperCase() as YardCurrency)
        : "USD",
      start_date: str(e.start_date) || periodStart,
      end_date: str(e.end_date) || periodEnd || "",
      status: "draft",
      notes: "",
      jobs,
    });
    setStage("verify");
  }

  async function save() {
    setError(null);
    if (!draft.title.trim()) {
      setError("Give the estimate a title so it can be told apart on the timeline.");
      return;
    }
    const amount = draft.amount.trim() === "" ? null : Number(draft.amount);
    if (amount != null && !Number.isFinite(amount)) {
      setError("The quoted total isn't a number.");
      return;
    }
    setSaving(true);
    try {
      // A vendor typed in by hand that doesn't exist yet gets created first —
      // otherwise the estimate saves with no vendor and the money view can't
      // group it.
      let vendorId = draft.vendor_id;
      const typed = draft.vendor_name.trim();
      if (!vendorId && typed) {
        const existing = vendorByName.get(typed.toLowerCase());
        if (existing) {
          vendorId = existing.id;
        } else {
          const vRes = await fetch("/api/yard-vendors", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: typed }),
          });
          if (vRes.ok) vendorId = (await vRes.json()).id;
        }
      }

      const res = await fetch(`/api/yard-periods/${periodId}/estimates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor_id: vendorId,
          title: draft.title.trim(),
          reference: draft.reference.trim() || null,
          amount,
          currency: draft.currency,
          start_date: draft.start_date || null,
          end_date: draft.end_date || null,
          status: draft.status,
          document_path: docPath,
          ai_extraction: rawExtraction ?? undefined,
          ai_confidence: confidence,
          notes: draft.notes.trim() || null,
          jobs: draft.jobs
            .filter((j) => j.include && j.title.trim())
            .map((j) => ({
              title: j.title.trim(),
              zone_id: j.zone_id,
              trade: j.trade,
              actual_cost: j.amount,
            })),
        }),
      });

      if (!res.ok) {
        const b = await res.json().catch(() => null);
        setError(b?.error === "forbidden" ? "Admins only." : "Couldn't save the estimate.");
        return;
      }
      const saved = await res.json();
      setStage("list");
      setDraft(EMPTY);
      setDocPath(null);
      setPreview(null);
      setNotice(
        saved.created_jobs > 0
          ? `Saved. ${saved.created_jobs} job${saved.created_jobs === 1 ? "" : "s"} added to the board and the timeline.`
          : "Estimate saved.",
      );
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const busy = stage === "uploading" || stage === "reading";

  return (
    <div className="space-y-4">
      {notice && (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-100">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-100">
          {error}
        </p>
      )}

      {stage === "list" || busy ? (
        <>
          <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">
                {estimates.length === 0
                  ? "No estimates yet"
                  : `${estimates.length} estimate${estimates.length === 1 ? "" : "s"}`}
              </h2>
              <div className="flex flex-wrap gap-2">
                <label className="cursor-pointer rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white active:bg-violet-700">
                  {busy ? (stage === "reading" ? "Reading…" : "Uploading…") : "Photograph an estimate"}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={busy}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                <label className="cursor-pointer rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 active:bg-slate-50">
                  Choose a file
                  <input
                    type="file"
                    accept="image/*"
                    disabled={busy}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={startManual}
                  disabled={busy}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
                >
                  Enter by hand
                </button>
              </div>
            </div>

            {estimates.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">
                Photograph a vendor&rsquo;s quote and its jobs land on the board and the timeline
                with it.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {estimates.map((e) => {
                  const r = rollUpEstimate(e, invoices, payments);
                  const vendor = vendors.find((v) => v.id === e.vendor_id);
                  const paidPct = r.committed > 0 ? Math.min(100, (r.paid / r.committed) * 100) : 0;
                  const duePct =
                    r.committed > 0 ? Math.min(100 - paidPct, (r.outstanding / r.committed) * 100) : 0;
                  return (
                    <li key={e.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900">
                            {vendor ? `${vendor.name} — ` : ""}
                            {e.title}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {e.reference && <>Quote {e.reference} · </>}
                            {e.start_date ? formatDate(e.start_date) : "No start"}
                            {e.end_date && <> → {formatDate(e.end_date)}</>}
                            {" · "}
                            {YARD_ESTIMATE_STATUS_LABELS[e.status]}
                          </p>
                          <div
                            className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-slate-200"
                            aria-hidden="true"
                          >
                            <i className="block h-full bg-emerald-600" style={{ width: `${paidPct}%` }} />
                            <i className="block h-full bg-rose-500" style={{ width: `${duePct}%` }} />
                          </div>
                        </div>
                        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-right">
                          <Fig k="Quoted" v={formatAmount(r.committed, e.currency)} />
                          <Fig k="Billed" v={formatAmount(r.billed, e.currency)} />
                          <Fig k="Paid" v={formatAmount(r.paid, e.currency)} tone="ok" />
                          <Fig
                            k="Open"
                            v={formatAmount(r.outstanding, e.currency)}
                            tone={r.outstanding > 0 ? "due" : undefined}
                          />
                        </dl>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Check this before saving
            </h2>
            <p className="text-xs text-slate-500">Nothing is saved until you press save.</p>
          </div>

          <div className="grid gap-4 p-4 lg:grid-cols-[220px_1fr]">
            <div className="space-y-2">
              {preview ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={preview}
                  alt="The estimate you photographed"
                  className="w-full rounded-xl object-contain ring-1 ring-slate-200"
                />
              ) : (
                <div className="rounded-xl bg-slate-50 px-3 py-8 text-center text-xs text-slate-400 ring-1 ring-slate-200">
                  No photo — entered by hand
                </div>
              )}
            </div>

            <div className="space-y-3">
              {(confidence === "low" || confidence === "medium") && (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
                  Read with {confidence} confidence. Double-check the total and the dates.
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Vendor" id="est-vendor">
                  <input
                    id="est-vendor"
                    list="yard-vendor-list"
                    value={draft.vendor_name}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        vendor_name: e.target.value,
                        vendor_id: vendorByName.get(e.target.value.trim().toLowerCase())?.id ?? null,
                      })
                    }
                    className="w-full rounded-xl px-3 py-2 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Roscioli Yachting Center"
                  />
                  <datalist id="yard-vendor-list">
                    {vendors.map((v) => (
                      <option key={v.id} value={v.name} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Quote number" id="est-ref">
                  <input
                    id="est-ref"
                    value={draft.reference}
                    onChange={(e) => setDraft({ ...draft, reference: e.target.value })}
                    className="w-full rounded-xl px-3 py-2 text-sm tabular-nums ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </Field>
                <Field label="What the job is" id="est-title">
                  <input
                    id="est-title"
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    className="w-full rounded-xl px-3 py-2 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Bottom, paint & topsides"
                  />
                </Field>
                <Field label="Quoted total" id="est-amount">
                  <div className="flex gap-2">
                    <input
                      id="est-amount"
                      inputMode="decimal"
                      value={draft.amount}
                      onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                      className="w-full rounded-xl px-3 py-2 text-sm tabular-nums ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <select
                      aria-label="Currency"
                      value={draft.currency}
                      onChange={(e) =>
                        setDraft({ ...draft, currency: e.target.value as YardCurrency })
                      }
                      className="rounded-xl px-2 py-2 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                      {["USD", "EUR", "GBP", "CAD", "AUD"].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </Field>
                <Field label="On the boat from" id="est-start">
                  <input
                    id="est-start"
                    type="date"
                    value={draft.start_date}
                    onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
                    className="w-full rounded-xl px-3 py-2 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </Field>
                <Field label="Until" id="est-end">
                  <input
                    id="est-end"
                    type="date"
                    value={draft.end_date}
                    onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
                    className="w-full rounded-xl px-3 py-2 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </Field>
              </div>

              {draft.jobs.length > 0 && (
                <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
                  <p className="bg-violet-50 px-3 py-2 text-xs font-medium text-violet-800">
                    {draft.jobs.filter((j) => j.include).length} of {draft.jobs.length} jobs will go
                    on the board and the timeline
                  </p>
                  <ul className="divide-y divide-slate-100">
                    {draft.jobs.map((j, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-2 px-3 py-2">
                        <input
                          type="checkbox"
                          id={`job-${i}`}
                          checked={j.include}
                          onChange={(e) => {
                            const jobs = [...draft.jobs];
                            jobs[i] = { ...j, include: e.target.checked };
                            setDraft({ ...draft, jobs });
                          }}
                          className="h-4 w-4 accent-violet-600"
                        />
                        <label htmlFor={`job-${i}`} className="min-w-0 flex-1 truncate text-sm text-slate-700">
                          {j.title}
                        </label>
                        <select
                          aria-label={`Room for ${j.title}`}
                          value={j.zone_id ?? ""}
                          onChange={(e) => {
                            const jobs = [...draft.jobs];
                            jobs[i] = { ...j, zone_id: e.target.value || null };
                            setDraft({ ...draft, jobs });
                          }}
                          className="rounded-lg px-2 py-1 text-xs ring-1 ring-slate-200"
                        >
                          <option value="">No room</option>
                          {zones.map((z) => (
                            <option key={z.id} value={z.id}>
                              {z.name}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label={`Trade for ${j.title}`}
                          value={j.trade ?? ""}
                          onChange={(e) => {
                            const jobs = [...draft.jobs];
                            jobs[i] = { ...j, trade: e.target.value || null };
                            setDraft({ ...draft, jobs });
                          }}
                          className="rounded-lg px-2 py-1 text-xs ring-1 ring-slate-200"
                        >
                          <option value="">No trade</option>
                          {YARD_TRADES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <span className="w-24 text-right text-xs tabular-nums text-slate-600">
                          {j.amount == null ? "—" : formatAmount(j.amount, draft.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white active:bg-violet-700 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save estimate"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStage("list");
                    setError(null);
                  }}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 active:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Fig({ k, v, tone }: { k: string; v: string; tone?: "ok" | "due" }) {
  const color = tone === "ok" ? "text-emerald-700" : tone === "due" ? "text-rose-700" : "text-slate-900";
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-slate-400">{k}</dt>
      <dd className={`text-sm font-medium tabular-nums ${color}`}>{v}</dd>
    </div>
  );
}

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-[10px] uppercase tracking-wider text-slate-400">
        {label}
      </label>
      {children}
    </div>
  );
}
