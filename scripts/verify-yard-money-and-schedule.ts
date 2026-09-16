/**
 * Verification for the yard money + schedule release.
 *
 *   npx tsx scripts/verify-yard-money-and-schedule.ts
 *
 * Two halves:
 *   1. The clash rules and bar geometry, as pure functions with hand-built
 *      fixtures — including Craig's two examples, which must both fire.
 *   2. The money arithmetic, run against the LIVE database and reconciled to
 *      the real Roscioli invoice total of $723,247.34. Read-only: this script
 *      never writes.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import {
  findClashes,
  overlapRange,
  placeBar,
  spanDays,
  addDays,
  dayIndex,
} from "../src/lib/yard-schedule";
import { getYardMoney, rollUpEstimate } from "../src/lib/yard-money";
import type { VesselZone, YardConflictRule, YardTask } from "../src/lib/types";

const ROSCIOLI_PERIOD = "9365f17e-2d8f-4da9-8461-20c04d0af851";
const ROSCIOLI_TOTAL = 723247.34;

let passed = 0;
let failed = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
  }
}

function env(key: string): string {
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith(`${key}=`)) return line.slice(key.length + 1).trim().replace(/^"|"$/g, "");
  }
  throw new Error(`${key} missing from .env.local`);
}

// --------------------------------------------------------------- fixtures
const ENGINE_ROOM = "zone-engine-room";
const AFT_DECK = "zone-aft-deck";
const HULL = "zone-hull";

const zones: VesselZone[] = [
  { id: ENGINE_ROOM, code: "engine_room", name: "Engine Room", display_order: 60, active: true },
  { id: AFT_DECK, code: "aft_deck", name: "Aft Deck", display_order: 90, active: true },
  { id: HULL, code: "hull", name: "Hull", display_order: 200, active: true },
];

const rules: YardConflictRule[] = [
  {
    id: "r-zone", kind: "same_zone", trade_a: "machinery", trade_b: null, zone_id: null,
    severity: "warn", reason: "One machinery job in a room at a time.",
    active: true, created_by: null, created_at: "",
  },
  {
    id: "r-spray", kind: "trade_pair", trade_a: "spraying", trade_b: "sanding", zone_id: null,
    severity: "warn", reason: "Don't spray while anyone is sanding.",
    active: true, created_by: null, created_at: "",
  },
  {
    id: "r-hot", kind: "trade_pair", trade_a: "hot work", trade_b: "spraying", zone_id: null,
    severity: "block", reason: "No hot work while spraying.",
    active: true, created_by: null, created_at: "",
  },
  {
    id: "r-off", kind: "trade_pair", trade_a: "canvas", trade_b: "cleaning", zone_id: null,
    severity: "block", reason: "Inactive rule that must never fire.",
    active: false, created_by: null, created_at: "",
  },
];

function task(p: Partial<YardTask> & { id: string; title: string }): YardTask {
  return {
    yard_period_id: "p", quadrant_id: "q", description: null, owner_id: null,
    follower_ids: [], progress_pct: 0, effort: null, urgency: null, due_date: null,
    reminder_date: null, resources: null, status: "todo", actual_cost: null,
    start_date: null, end_date: null, zone_id: null, trade: null, estimate_id: null,
    depends_on_ids: [], completed_at: null, completed_by: null,
    created_at: "", updated_at: "", ...p,
  } as YardTask;
}

// ------------------------------------------------------------------ dates
console.log("\nDates and geometry");
check("spanDays is inclusive — one day is 1", spanDays("2026-07-06", "2026-07-06"), 1);
check("spanDays 6–17 Jul", spanDays("2026-07-06", "2026-07-17"), 12);
check("dayIndex across a month boundary", dayIndex("2026-06-01", "2026-07-01"), 30);
check("addDays crosses a month", addDays("2026-07-30", 3), "2026-08-02");
// 1 Jun → 31 Oct 2026 is 153 days; 15 Jun is day 14.
check("placeBar left % for 15 Jun", Number(placeBar("2026-06-01", 153, "2026-06-15", "2026-06-30").left.toFixed(3)), 9.15);
check("placeBar clamps a bar running past the period end", placeBar("2026-06-01", 30, "2026-06-20", "2026-09-30").width <= 100, true);
check("overlapRange finds the shared stretch", overlapRange("2026-07-06", "2026-07-17", "2026-07-10", "2026-07-31")?.days, 8);
check("overlapRange returns null when they don't touch", overlapRange("2026-07-01", "2026-07-05", "2026-07-06", "2026-07-09"), null);

// ----------------------------------------------------------- Craig's rules
console.log("\nCraig's two clash examples");
const craig = [
  task({ id: "stab", title: "Stabilizers — rebuild", start_date: "2026-07-06", end_date: "2026-07-24", zone_id: ENGINE_ROOM, trade: "machinery" }),
  task({ id: "gen", title: "Generator 2 — top end", start_date: "2026-07-13", end_date: "2026-08-05", zone_id: ENGINE_ROOM, trade: "machinery" }),
  task({ id: "paint", title: "Paint bottom", start_date: "2026-07-06", end_date: "2026-07-17", zone_id: HULL, trade: "spraying" }),
  task({ id: "teak", title: "Sand teak decks", start_date: "2026-07-10", end_date: "2026-07-31", zone_id: AFT_DECK, trade: "sanding" }),
];
const found = findClashes(craig, rules, zones);
check("exactly two clashes", found.length, 2);
check(
  "engine room: two machinery jobs, 13–24 Jul",
  found.filter((c) => c.rule_id === "r-zone").map((c) => [c.start, c.end, c.days, c.zone_name])[0],
  ["2026-07-13", "2026-07-24", 12, "Engine Room"],
);
check(
  "spraying while sanding, 10–17 Jul, across different rooms",
  found.filter((c) => c.rule_id === "r-spray").map((c) => [c.start, c.end, c.days])[0],
  ["2026-07-10", "2026-07-17", 8],
);

console.log("\nWhat must NOT be flagged");
check(
  "two machinery jobs in DIFFERENT rooms",
  findClashes(
    [
      task({ id: "a", title: "A", start_date: "2026-07-06", end_date: "2026-07-24", zone_id: ENGINE_ROOM, trade: "machinery" }),
      task({ id: "b", title: "B", start_date: "2026-07-06", end_date: "2026-07-24", zone_id: AFT_DECK, trade: "machinery" }),
    ], rules, zones).length,
  0,
);
check(
  "same room, same trade, dates that don't overlap",
  findClashes(
    [
      task({ id: "a", title: "A", start_date: "2026-07-01", end_date: "2026-07-05", zone_id: ENGINE_ROOM, trade: "machinery" }),
      task({ id: "b", title: "B", start_date: "2026-07-06", end_date: "2026-07-10", zone_id: ENGINE_ROOM, trade: "machinery" }),
    ], rules, zones).length,
  0,
);
check(
  "a job with no dates can't clash",
  findClashes(
    [
      task({ id: "a", title: "A", zone_id: ENGINE_ROOM, trade: "machinery" }),
      task({ id: "b", title: "B", start_date: "2026-07-06", end_date: "2026-07-24", zone_id: ENGINE_ROOM, trade: "machinery" }),
    ], rules, zones).length,
  0,
);
check(
  "completed work is not a clash",
  findClashes(
    [
      task({ id: "a", title: "A", start_date: "2026-07-06", end_date: "2026-07-24", zone_id: ENGINE_ROOM, trade: "machinery", status: "done" }),
      task({ id: "b", title: "B", start_date: "2026-07-06", end_date: "2026-07-24", zone_id: ENGINE_ROOM, trade: "machinery" }),
    ], rules, zones).length,
  0,
);
check(
  "an inactive rule never fires",
  findClashes(
    [
      task({ id: "a", title: "A", start_date: "2026-07-06", end_date: "2026-07-24", trade: "canvas" }),
      task({ id: "b", title: "B", start_date: "2026-07-06", end_date: "2026-07-24", trade: "cleaning" }),
    ], rules, zones).length,
  0,
);
check(
  "a pair tripping two rules reports once, at the worse severity",
  (() => {
    const c = findClashes(
      [
        task({ id: "a", title: "A", start_date: "2026-07-06", end_date: "2026-07-24", trade: "hot work" }),
        task({ id: "b", title: "B", start_date: "2026-07-06", end_date: "2026-07-24", trade: "spraying" }),
      ], rules, zones);
    return [c.length, c[0]?.severity];
  })(),
  [1, "block"],
);

// ------------------------------------------------------------ live money
async function main() {
  console.log("\nMoney, against the live database");
  const supabase = createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const money = await getYardMoney(supabase, ROSCIOLI_PERIOD);
  const usd = money.blocks[0];

  check("one currency block", money.blocks.length, 1);
  check("it is USD", usd.currency, "USD");
  check("committed equals the real invoice", usd.committed, ROSCIOLI_TOTAL);
  check("billed equals the real invoice", usd.billed, ROSCIOLI_TOTAL);
  check("paid equals the real invoice", usd.paid, ROSCIOLI_TOTAL);
  check("a closed, settled job owes nothing", usd.outstanding, 0);
  check("nothing left to bill", usd.still_to_come, 0);
  check("three vendors", usd.vendors.length, 3);
  check("no money landed in Unassigned", usd.vendors.filter((v) => v.vendor_id === null).length, 0);
  check(
    "the vendor split sums back to the invoice",
    Number(usd.vendors.reduce((t, v) => t + v.committed, 0).toFixed(2)),
    ROSCIOLI_TOTAL,
  );
  check("biggest vendor is Roscioli", usd.vendors[0].vendor_name, "Roscioli Yachting Center");

  // The identity that stops a deposit double-counting against its invoice.
  for (const e of money.estimates) {
    const r = rollUpEstimate(e, money.invoices, money.payments);
    check(
      `identities hold for "${e.title.slice(0, 32)}"`,
      [
        Number((r.billed - r.paid).toFixed(2)) === r.outstanding,
        Number((r.committed - r.billed).toFixed(2)) === r.still_to_come,
      ],
      [true, true],
    );
  }

  // A deposit paid before anything is billed — Craig's "$80k already" case.
  console.log("\nThe deposit case, in arithmetic");
  const fakeEstimate = { ...money.estimates[0], id: "E", amount: 290000 };
  const deposit = rollUpEstimate(
    fakeEstimate,
    [{ ...money.invoices[0], id: "I", estimate_id: "E", amount: 86000 }],
    [
      { ...money.payments[0], id: "P1", estimate_id: "E", amount: 72500, kind: "deposit" as const },
      { ...money.payments[0], id: "P2", estimate_id: "E", amount: 13500, kind: "progress" as const },
    ],
  );
  check("committed", deposit.committed, 290000);
  check("billed", deposit.billed, 86000);
  check("paid — deposit plus the balance", deposit.paid, 86000);
  check("outstanding is zero, not double-counted", deposit.outstanding, 0);
  check("still to come", deposit.still_to_come, 204000);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);

}

main();
