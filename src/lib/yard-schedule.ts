import type { YardConflictRule, YardTask, VesselZone } from "@/lib/types";

// ---------------------------------------------------------------------------
// Scheduling maths for the yard timeline, and the clash check.
//
// The clash check is deliberately PURE and SYNCHRONOUS. It runs in the browser
// on every drag of a bar: no network call, no API spend, no waiting, and the
// same answer every time for the same plan. Claude gets a separate, explicit
// "review the schedule" pass that can see things the rule list doesn't know
// about and propose new rules — but it is never in the way of dragging a bar.
//
// Craig's two examples are the two rule shapes:
//   same_zone  — "machinery in engine room, can't happen at the same time"
//   trade_pair — "can't spray bottom paint when sanding teak"
// ---------------------------------------------------------------------------

/** Days between two YYYY-MM-DD dates, anchored to local noon to dodge DST. */
export function dayIndex(from: string, date: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [y, m, d] = date.split("-").map(Number);
  const a = new Date(fy, fm - 1, fd, 12).getTime();
  const b = new Date(y, m - 1, d, 12).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(y, m - 1, d, 12);
  t.setDate(t.getDate() + days);
  const yy = t.getFullYear();
  const mm = String(t.getMonth() + 1).padStart(2, "0");
  const dd = String(t.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Inclusive span in days: a one-day job is 1, not 0. */
export function spanDays(start: string, end: string): number {
  return dayIndex(start, end) + 1;
}

export interface Placement {
  /** Percent from the left edge of the period track. */
  left: number;
  /** Percent width. */
  width: number;
}

/**
 * Where a bar sits on a period track. Clamped to the track: a job that runs
 * past the end of the yard period still renders inside it rather than
 * overflowing the card, and the label tells the truth about the real dates.
 */
export function placeBar(
  periodStart: string,
  periodDays: number,
  start: string,
  end: string,
): Placement {
  const rawLeft = dayIndex(periodStart, start);
  const rawSpan = spanDays(start, end);
  const left = Math.max(0, Math.min(rawLeft, periodDays));
  const right = Math.max(0, Math.min(rawLeft + rawSpan, periodDays));
  return {
    left: (left / periodDays) * 100,
    width: (Math.max(right - left, 0.5) / periodDays) * 100,
  };
}

/** Do two inclusive date ranges share at least one day? */
export function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** The overlapping stretch of two ranges, or null when they don't touch. */
export function overlapRange(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): { start: string; end: string; days: number } | null {
  if (!overlaps(aStart, aEnd, bStart, bEnd)) return null;
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  return { start, end, days: spanDays(start, end) };
}

export interface Clash {
  /** Stable id so React keys and the highlight map don't churn on re-render. */
  id: string;
  rule_id: string;
  severity: "warn" | "block";
  reason: string;
  task_a: string;
  task_b: string;
  title_a: string;
  title_b: string;
  zone_name: string | null;
  start: string;
  end: string;
  days: number;
}

type Scheduled = YardTask & { start_date: string; end_date: string };

function isScheduled(t: YardTask): t is Scheduled {
  return Boolean(t.start_date && t.end_date);
}

const norm = (v: string | null) => (v ?? "").trim().toLowerCase();

/**
 * Every clash in a set of tasks, against the active rules.
 *
 * Only scheduled tasks can clash — a job with no dates isn't competing for
 * anything yet. Completed tasks are skipped too: warning about a conflict with
 * work that is already finished is noise, not information.
 *
 * Each pair is tested once (j starts at i+1), and a pair that trips several
 * rules reports the most severe one only, so the alert list stays readable.
 */
export function findClashes(
  tasks: YardTask[],
  rules: YardConflictRule[],
  zones: VesselZone[],
): Clash[] {
  const live = tasks.filter((t) => isScheduled(t) && t.status !== "done") as Scheduled[];
  const active = rules.filter((r) => r.active);
  const zoneName = new Map(zones.map((z) => [z.id, z.name]));
  const out: Clash[] = [];

  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      const range = overlapRange(a.start_date, a.end_date, b.start_date, b.end_date);
      if (!range) continue;

      let hit: { rule: YardConflictRule } | null = null;

      for (const rule of active) {
        if (rule.kind === "same_zone") {
          // Both jobs must be in a room, and the same one.
          if (!a.zone_id || !b.zone_id || a.zone_id !== b.zone_id) continue;
          if (rule.zone_id && rule.zone_id !== a.zone_id) continue;
          // trade_a null means "any two jobs in this room".
          if (rule.trade_a) {
            const want = norm(rule.trade_a);
            if (norm(a.trade) !== want || norm(b.trade) !== want) continue;
          }
        } else {
          // trade_pair: the two jobs must be the two named trades, either way round.
          const ra = norm(rule.trade_a);
          const rb = norm(rule.trade_b);
          const ta = norm(a.trade);
          const tb = norm(b.trade);
          const matched = (ta === ra && tb === rb) || (ta === rb && tb === ra);
          if (!matched) continue;
          // A zone-scoped trade rule only bites inside that room.
          if (rule.zone_id && !(a.zone_id === rule.zone_id && b.zone_id === rule.zone_id)) {
            continue;
          }
        }

        // Keep the worst rule this pair trips, not the first.
        if (!hit || (rule.severity === "block" && hit.rule.severity === "warn")) {
          hit = { rule };
        }
      }

      if (!hit) continue;
      out.push({
        id: `${a.id}:${b.id}:${hit.rule.id}`,
        rule_id: hit.rule.id,
        severity: hit.rule.severity,
        reason: hit.rule.reason,
        task_a: a.id,
        task_b: b.id,
        title_a: a.title,
        title_b: b.title,
        zone_name:
          a.zone_id && a.zone_id === b.zone_id ? (zoneName.get(a.zone_id) ?? null) : null,
        start: range.start,
        end: range.end,
        days: range.days,
      });
    }
  }

  // Blocks before warnings, then longest overlap first — worst news at the top.
  return out.sort(
    (x, y) =>
      (x.severity === y.severity ? 0 : x.severity === "block" ? -1 : 1) ||
      y.days - x.days,
  );
}

/** Task ids involved in at least one clash, for highlighting bars. */
export function clashedTaskIds(clashes: Clash[]): Set<string> {
  const s = new Set<string>();
  for (const c of clashes) {
    s.add(c.task_a);
    s.add(c.task_b);
  }
  return s;
}
