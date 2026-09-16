import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { cleanEnv } from "@/lib/supabase/env";
import { getUserRole } from "@/lib/auth";
import { findClashes } from "@/lib/yard-schedule";
import type {
  VesselZone,
  YardConflictRule,
  YardPeriod,
  YardTask,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// "Review this. Ai can tell them what to do."
//
// This is the SECOND opinion, never the first. The timeline already checks the
// rule list in the browser on every drag — instantly, free, and with the same
// answer every time. This route runs only when Craig asks, and earns its keep
// by seeing what a rule list cannot: work that is out of order, a contractor
// who needs booking before anything else can start, a clash nobody has written
// a rule for yet.
//
// It reports the deterministic clashes alongside the model's, so the answer is
// never quieter than the rule list. Proposed rules come back as structured
// rows Craig accepts or ignores; nothing is written to the rules table here.
// ---------------------------------------------------------------------------

const MODEL = "claude-sonnet-5";

const bodySchema = z.object({ yard_period_id: z.string().uuid() });

const SYSTEM = `You are an experienced yard project manager reviewing the schedule for a refit on a 107ft motor yacht.

You are given the yard period, the vendors on site, and every job with its dates, the room it happens in, and its trade. You are also given the clash rules the app already enforces, and the clashes it has already found by applying them.

Your job is to find what the rule list CANNOT see, and to say what to do about it.

Hard rules:
- Work ONLY from the records given. Never invent a job, a date, a cost or a vendor.
- The app has already reported the clashes listed under "clashes_found". Do not simply repeat them. Reference one only when you have something to add — a suggested resequencing, or a consequence that isn't obvious.
- Look especially for: work sequenced in the wrong order (painting before fairing, launching before the running gear is back in); jobs that need a specialist booked weeks ahead; a room carrying far more work than its dates allow; gaps where the vessel is idle; and pairs that clash for a reason nobody has written a rule for.
- Bottom paint, haul-out and launch are hard bookends: nothing underwater can happen after launch.
- Be specific. "Move the generator service" is useless; "move the generator top-end to 5-16 Aug, after the stabilizers are back in" is useful.

Answer in plain prose. No markdown, no bullet characters, no headings. Three short paragraphs at most.

Then, and only if you found a clash pattern worth adding to the app's rule list permanently, append a final line that is exactly:

RULES: [{"kind":"trade_pair","trade_a":"...","trade_b":"...","severity":"warn","reason":"..."}]

kind is "trade_pair" or "same_zone". For same_zone, set trade_a to the trade (or null for any job) and leave trade_b null. severity is "warn" or "block". Propose at most three, and none that duplicate a rule already in the list. If you have none to propose, omit the RULES line entirely.`;

export async function POST(request: Request) {
  if ((await getUserRole()) !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const periodId = parsed.data.yard_period_id;

  const [
    { data: period },
    { data: tasks },
    { data: estimates },
    { data: rules },
    { data: zones },
  ] = await Promise.all([
    supabase.from("yard_periods").select().eq("id", periodId).single<YardPeriod>(),
    supabase.from("yard_tasks").select().eq("yard_period_id", periodId).returns<YardTask[]>(),
    supabase
      .from("yard_estimates")
      .select("id, title, reference, start_date, end_date, vendor_id, amount, currency")
      .eq("yard_period_id", periodId),
    supabase.from("yard_conflict_rules").select().eq("active", true).returns<YardConflictRule[]>(),
    supabase.from("vessel_zones").select().eq("active", true).returns<VesselZone[]>(),
  ]);

  if (!period) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const allTasks = tasks ?? [];
  const allZones = zones ?? [];
  const allRules = rules ?? [];
  const zoneName = new Map(allZones.map((z) => [z.id, z.name]));

  const scheduled = allTasks.filter((t) => t.start_date && t.end_date);
  if (scheduled.length === 0) {
    return NextResponse.json({
      answer:
        "Nothing on this yard period has dates yet, so there is no sequence to review. Put start and end dates on the jobs — or capture an estimate, which dates them for you — and ask again.",
      clashes: [],
      proposed_rules: [],
      model: MODEL,
    });
  }

  // The deterministic pass runs first and its result is handed to the model,
  // so the model spends its attention on what the rules miss.
  const clashes = findClashes(allTasks, allRules, allZones);

  const { data: vendors } = await supabase.from("yard_vendors").select("id, name, trade");
  const vendorName = new Map((vendors ?? []).map((v) => [v.id, v.name]));

  const summary = {
    yard_period: {
      name: period.name,
      start: period.start_date,
      end: period.end_date,
      status: period.status,
    },
    estimates: (estimates ?? []).map((e) => ({
      title: e.title,
      vendor: e.vendor_id ? (vendorName.get(e.vendor_id) ?? null) : null,
      reference: e.reference,
      on_site: [e.start_date, e.end_date],
      amount: e.amount,
      currency: e.currency,
    })),
    jobs: scheduled.map((t) => ({
      title: t.title,
      start: t.start_date,
      end: t.end_date,
      room: t.zone_id ? (zoneName.get(t.zone_id) ?? null) : null,
      trade: t.trade,
      status: t.status,
      progress_pct: t.progress_pct,
    })),
    unscheduled_jobs: allTasks
      .filter((t) => !t.start_date || !t.end_date)
      .map((t) => t.title),
    rules_in_force: allRules.map((r) => ({
      kind: r.kind,
      trade_a: r.trade_a,
      trade_b: r.trade_b,
      room: r.zone_id ? (zoneName.get(r.zone_id) ?? null) : null,
      severity: r.severity,
      reason: r.reason,
    })),
    clashes_found: clashes.map((c) => ({
      a: c.title_a,
      b: c.title_b,
      room: c.zone_name,
      from: c.start,
      to: c.end,
      days: c.days,
      why: c.reason,
    })),
  };

  const anthropic = new Anthropic({ apiKey: cleanEnv(process.env.ANTHROPIC_API_KEY) });

  let message;
  try {
    message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(summary) }],
    });
  } catch (err) {
    console.error("anthropic call failed", err);
    // The rule-list clashes are real and already computed — hand them back
    // even though the second opinion failed. A dead API must not blank the
    // screen Craig came to look at.
    return NextResponse.json(
      {
        answer: null,
        error: "review_failed",
        clashes,
        proposed_rules: [],
      },
      { status: 200 },
    );
  }

  const textBlock = message.content.find((b) => b.type === "text");
  let answer = textBlock && "text" in textBlock ? textBlock.text.trim() : "";

  // Split the optional trailing RULES: line off the prose.
  const proposed: unknown[] = [];
  const idx = answer.lastIndexOf("RULES:");
  if (idx !== -1) {
    const tail = answer.slice(idx + "RULES:".length).trim();
    answer = answer.slice(0, idx).trim();
    try {
      const arr = JSON.parse(tail);
      if (Array.isArray(arr)) proposed.push(...arr.slice(0, 3));
    } catch {
      // A malformed suggestion list is not worth failing the review over —
      // the prose is the part Craig reads.
    }
  }

  return NextResponse.json({
    answer,
    clashes,
    proposed_rules: proposed,
    model: MODEL,
  });
}
