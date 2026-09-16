"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";
import {
  addDays,
  clashedTaskIds,
  dayIndex,
  findClashes,
  placeBar,
  spanDays,
  type Clash,
} from "@/lib/yard-schedule";
import type {
  VesselZone,
  YardConflictRule,
  YardEstimate,
  YardPeriod,
  YardQuadrant,
  YardTask,
  YardVendor,
} from "@/lib/types";

// The timeline. Estimate phase bars over job bars, dragged rather than
// date-picked — Craig asked for a slider, not a calendar.
//
// The clash check runs here, in the browser, on every frame of a drag: it is
// pure arithmetic over the rule list, so it costs nothing and cannot disagree
// with itself. Claude is a separate button, for the things a rule list can't
// know. That split is the whole design — instant feedback while you work, a
// considered second opinion when you ask for one.

const PASTEL_TEXT: Record<string, string> = {
  "#bae6fd": "#0369a1",
  "#bbf7d0": "#15803d",
  "#fed7aa": "#c2410c",
  "#ddd6fe": "#6d28d9",
};

type DragMode = "move" | "start" | "end";

interface DragState {
  taskId: string;
  mode: DragMode;
  originX: number;
  pxPerDay: number;
  baseStart: string;
  baseEnd: string;
}

interface ProposedRule {
  kind?: unknown;
  trade_a?: unknown;
  trade_b?: unknown;
  severity?: unknown;
  reason?: unknown;
}

export default function YardGantt({
  period,
  quadrants,
  tasks: initialTasks,
  estimates,
  vendors,
  zones,
  rules,
  isAdmin,
}: {
  period: YardPeriod;
  quadrants: YardQuadrant[];
  tasks: YardTask[];
  estimates: YardEstimate[];
  vendors: YardVendor[];
  zones: VesselZone[];
  rules: YardConflictRule[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  // Local copy so a drag repaints at pointer speed. The server is told on
  // release, then router.refresh() reconciles.
  const [tasks, setTasks] = useState<YardTask[]>(initialTasks);
  const [dragging, setDragging] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [proposed, setProposed] = useState<ProposedRule[]>([]);
  const [reviewing, setReviewing] = useState(false);

  const periodEnd = period.end_date ?? addDays(period.start_date, 180);
  const periodDays = Math.max(1, spanDays(period.start_date, periodEnd));

  const zoneName = useMemo(() => new Map(zones.map((z) => [z.id, z.name])), [zones]);
  const vendorName = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors]);

  const clashes = useMemo(() => findClashes(tasks, rules, zones), [tasks, rules, zones]);
  const clashed = useMemo(() => clashedTaskIds(clashes), [clashes]);

  // Month ticks, positioned by real day offsets — months aren't equal length,
  // so an evenly-spaced grid would lie about where the dates fall.
  const months = useMemo(() => {
    const out: { label: string; left: number }[] = [];
    const [y0, m0] = period.start_date.split("-").map(Number);
    let y = y0;
    let m = m0;
    for (let i = 0; i < 60; i++) {
      const first = `${y}-${String(m).padStart(2, "0")}-01`;
      const idx = dayIndex(period.start_date, first);
      if (idx > periodDays) break;
      if (idx >= 0) {
        out.push({
          label: new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" }),
          left: (idx / periodDays) * 100,
        });
      }
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    return out;
  }, [period.start_date, periodDays]);

  function beginDrag(e: React.PointerEvent, task: YardTask, mode: DragMode) {
    if (!isAdmin || !task.start_date || !task.end_date) return;
    const track = trackRef.current;
    if (!track) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      taskId: task.id,
      mode,
      originX: e.clientX,
      pxPerDay: track.clientWidth / periodDays,
      baseStart: task.start_date,
      baseEnd: task.end_date,
    };
    setDragging(task.id);
  }

  function onDragMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || d.pxPerDay <= 0) return;
    const deltaDays = Math.round((e.clientX - d.originX) / d.pxPerDay);
    if (deltaDays === 0 && d.mode === "move") return;

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== d.taskId) return t;
        if (d.mode === "move") {
          return {
            ...t,
            start_date: addDays(d.baseStart, deltaDays),
            end_date: addDays(d.baseEnd, deltaDays),
          };
        }
        if (d.mode === "start") {
          const next = addDays(d.baseStart, deltaDays);
          // A bar can't be dragged inside out — one day is the floor.
          return { ...t, start_date: next > d.baseEnd ? d.baseEnd : next };
        }
        const next = addDays(d.baseEnd, deltaDays);
        return { ...t, end_date: next < d.baseStart ? d.baseStart : next };
      }),
    );
  }

  async function endDrag() {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(null);
    if (!d) return;

    const task = tasks.find((t) => t.id === d.taskId);
    if (!task || !task.start_date || !task.end_date) return;
    if (task.start_date === d.baseStart && task.end_date === d.baseEnd) return;

    setSaveError(null);
    const res = await fetch(`/api/yard-periods/${period.id}/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start_date: task.start_date, end_date: task.end_date }),
    });

    if (!res.ok) {
      // Put the bar back where it was rather than leaving the screen showing
      // dates the database never accepted.
      setTasks((prev) =>
        prev.map((t) =>
          t.id === d.taskId ? { ...t, start_date: d.baseStart, end_date: d.baseEnd } : t,
        ),
      );
      setSaveError("That move didn't save. The bar has been put back.");
      return;
    }
    router.refresh();
  }

  async function askClaude() {
    setReviewing(true);
    setReview(null);
    setProposed([]);
    try {
      const res = await fetch("/api/yard/schedule/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yard_period_id: period.id }),
      });
      const body = await res.json().catch(() => null);
      if (!body || body.error === "review_failed") {
        setReview("Couldn't reach Claude just now. The clashes below are still current.");
        return;
      }
      setReview(body.answer || "Nothing to flag beyond the clashes already listed.");
      setProposed(Array.isArray(body.proposed_rules) ? body.proposed_rules : []);
    } finally {
      setReviewing(false);
    }
  }

  async function acceptRule(r: ProposedRule, i: number) {
    const res = await fetch("/api/yard-conflict-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: r.kind === "same_zone" ? "same_zone" : "trade_pair",
        trade_a: typeof r.trade_a === "string" ? r.trade_a : null,
        trade_b: typeof r.trade_b === "string" ? r.trade_b : null,
        severity: r.severity === "block" ? "block" : "warn",
        reason: typeof r.reason === "string" ? r.reason : "Added from a schedule review.",
      }),
    });
    if (res.ok) {
      setProposed((p) => p.filter((_, n) => n !== i));
      router.refresh();
    }
  }

  const scheduled = tasks.filter((t) => t.start_date && t.end_date);
  const unscheduled = tasks.filter((t) => !t.start_date || !t.end_date);

  return (
    <div className="space-y-4">
      {saveError && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-100">
          {saveError}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Timeline</h2>
          <p className="text-xs text-slate-400">
            {isAdmin ? "Drag a bar to move it · drag its end to stretch it" : "Read only"}
          </p>
        </div>

        {scheduled.length === 0 && estimates.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            Nothing is scheduled yet. Capture an estimate and its jobs arrive here with dates
            already on them.
          </p>
        ) : (
          <div
            className="space-y-1.5 overflow-x-auto p-4"
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {/* Month scale */}
            <div className="grid grid-cols-[150px_1fr] sm:grid-cols-[190px_1fr]">
              <div />
              <div className="relative h-5 border-b border-slate-200" ref={trackRef}>
                {months.map((m) => (
                  <span
                    key={m.label + m.left}
                    style={{ left: `${m.left}%` }}
                    className="absolute top-0 border-l border-slate-200 pl-1 text-[10px] uppercase tracking-wider text-slate-400"
                  >
                    {m.label}
                  </span>
                ))}
              </div>
            </div>

            {estimates.length > 0 && <GroupLabel>The ship</GroupLabel>}
            {estimates.map((e) => {
              if (!e.start_date || !e.end_date) return null;
              const pos = placeBar(period.start_date, periodDays, e.start_date, e.end_date);
              return (
                <Row
                  key={e.id}
                  label={vendorName.get(e.vendor_id ?? "") ?? e.title}
                  sub={e.title}
                  bold
                >
                  <div
                    className="absolute top-1/2 flex h-6 -translate-y-1/2 items-center overflow-hidden rounded-lg bg-slate-800 px-2 text-[11px] font-medium text-white"
                    style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
                    title={`${formatDate(e.start_date)} → ${formatDate(e.end_date)}`}
                  >
                    <span className="truncate">
                      {formatDate(e.start_date)} → {formatDate(e.end_date)}
                    </span>
                  </div>
                </Row>
              );
            })}

            {quadrants.map((q) => {
              const rows = scheduled.filter((t) => t.quadrant_id === q.id);
              if (rows.length === 0) return null;
              return (
                <div key={q.id} className="space-y-1.5">
                  <GroupLabel>{q.name}</GroupLabel>
                  {rows.map((t) => {
                    const pos = placeBar(
                      period.start_date,
                      periodDays,
                      t.start_date as string,
                      t.end_date as string,
                    );
                    const bad = clashed.has(t.id);
                    const text = PASTEL_TEXT[q.color] ?? "#334155";
                    return (
                      <Row
                        key={t.id}
                        label={t.title}
                        sub={[t.zone_id ? zoneName.get(t.zone_id) : null, t.trade]
                          .filter(Boolean)
                          .join(" · ")}
                      >
                        <div
                          onPointerDown={(e) => beginDrag(e, t, "move")}
                          role={isAdmin ? "button" : undefined}
                          tabIndex={isAdmin ? 0 : undefined}
                          aria-label={`${t.title}, ${formatDate(t.start_date)} to ${formatDate(t.end_date)}`}
                          title={`${formatDate(t.start_date)} → ${formatDate(t.end_date)}`}
                          className={`absolute top-1/2 flex h-5 -translate-y-1/2 items-center rounded-md ring-1 ${
                            bad ? "ring-2 ring-rose-500" : "ring-slate-900/10"
                          } ${isAdmin ? "cursor-grab touch-none active:cursor-grabbing" : ""} ${
                            dragging === t.id ? "opacity-80 shadow-lg" : ""
                          }`}
                          style={{
                            left: `${pos.left}%`,
                            width: `${pos.width}%`,
                            backgroundColor: q.color,
                            color: text,
                          }}
                        >
                          {isAdmin && (
                            <>
                              <span
                                onPointerDown={(e) => beginDrag(e, t, "start")}
                                className="absolute left-0 top-0 h-full w-2 cursor-ew-resize touch-none rounded-l-md"
                                aria-hidden="true"
                              />
                              <span
                                onPointerDown={(e) => beginDrag(e, t, "end")}
                                className="absolute right-0 top-0 h-full w-2 cursor-ew-resize touch-none rounded-r-md"
                                aria-hidden="true"
                              />
                            </>
                          )}
                        </div>
                      </Row>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {unscheduled.length > 0 && (
          <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
            {unscheduled.length} job{unscheduled.length === 1 ? "" : "s"} with no dates yet —
            they&rsquo;ll appear here once they have a start and an end.
          </p>
        )}
      </div>

      {/* Clashes — from the rule list, computed above with no network call */}
      {clashes.length > 0 && (
        <ul className="space-y-2">
          {clashes.map((c) => (
            <ClashCard key={c.id} clash={c} />
          ))}
        </ul>
      )}

      {isAdmin && (
        <div className="space-y-3 rounded-2xl bg-violet-50 p-4 ring-1 ring-violet-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-prose text-sm text-violet-900">
              {clashes.length > 0
                ? `${clashes.length} clash${clashes.length === 1 ? "" : "es"} from the rule list, checked as you drag. Want a second opinion on the whole plan?`
                : "No clashes in the rule list. Claude can look at the order of the work as well."}
            </p>
            <button
              type="button"
              onClick={askClaude}
              disabled={reviewing}
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white active:bg-violet-700 disabled:opacity-60"
            >
              {reviewing ? "Reading the schedule…" : "Ask Claude to review"}
            </button>
          </div>

          {review && (
            <p className="whitespace-pre-wrap rounded-xl bg-white p-3 text-sm text-slate-700 ring-1 ring-violet-100">
              {review}
            </p>
          )}

          {proposed.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-violet-700">
                Rules Claude suggests adding
              </p>
              {proposed.map((r, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-violet-100"
                >
                  <span className="min-w-0 flex-1 text-sm text-slate-700">
                    {typeof r.reason === "string" ? r.reason : "New rule"}
                  </span>
                  <button
                    type="button"
                    onClick={() => acceptRule(r, i)}
                    className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white active:bg-violet-700"
                  >
                    Add this rule
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="pt-2 text-[10px] uppercase tracking-wider text-slate-400">{children}</p>
  );
}

function Row({
  label,
  sub,
  bold,
  children,
}: {
  label: string;
  sub?: string | null;
  bold?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-[30px] grid-cols-[150px_1fr] items-center sm:grid-cols-[190px_1fr]">
      <div className="pr-3">
        <p
          className={`truncate text-xs ${bold ? "font-semibold text-slate-900" : "text-slate-700"}`}
        >
          {label}
        </p>
        {sub && <p className="truncate text-[10px] leading-tight text-slate-400">{sub}</p>}
      </div>
      <div className="relative h-full min-h-[26px] border-l border-slate-100">{children}</div>
    </div>
  );
}

function ClashCard({ clash }: { clash: Clash }) {
  const block = clash.severity === "block";
  return (
    <li
      className={`flex gap-3 rounded-2xl p-3 ring-1 ${
        block ? "bg-rose-50 ring-rose-200" : "bg-amber-50 ring-amber-200"
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs font-bold text-white ${
          block ? "bg-rose-600" : "bg-amber-600"
        }`}
      >
        !
      </span>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${block ? "text-rose-900" : "text-amber-900"}`}>
          {clash.title_a} and {clash.title_b} overlap {clash.days} day
          {clash.days === 1 ? "" : "s"}
          {clash.zone_name ? ` in the ${clash.zone_name.toLowerCase()}` : ""}
        </p>
        <p className={`text-xs ${block ? "text-rose-800" : "text-amber-800"}`}>
          {formatDate(clash.start)} → {formatDate(clash.end)}
        </p>
        <p className={`mt-1 text-xs ${block ? "text-rose-700" : "text-amber-700"}`}>
          {clash.reason}
        </p>
      </div>
    </li>
  );
}
