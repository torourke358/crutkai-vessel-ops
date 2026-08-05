import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { cleanEnv } from "@/lib/supabase/env";
import { writeAudit } from "@/lib/audit";
import { getUserRole } from "@/lib/auth";

// POST /api/drydock/analyze — the heart of the dry-dock planner. Takes the
// photos Craig shot of an area (already uploaded to the private
// disassembly-photos bucket) and asks Claude vision for the fastest safe
// disassembly ORDER, with blocking dependencies called out — the canonical
// case being an AC unit that must come out BEFORE engine work starts because
// the AC contractor has a ~2-week scheduling lead time. Persists the plan +
// steps and returns the plan id.

const MODEL = "claude-sonnet-5";
const BUCKET = "disassembly-photos";

const bodySchema = z.object({
  area_name: z.string().trim().min(1).max(200),
  yard_period_id: z.string().uuid().nullable().optional(),
  photo_paths: z.array(z.string().min(1).max(500)).min(1).max(12),
});

const SYSTEM_PROMPT = `
You are an experienced marine engineer and yard project manager planning a
dry-dock / yard period on a motor yacht. You are shown photos of one area of
the vessel (e.g. the engine room). Your job:

1. Identify every significant piece of equipment visible in the photos. Note
   port/starboard (left/right as seen may be mirrored — say "port" / "starboard"
   only when orientation is clear, otherwise "left in photo" / "right in photo").
2. Produce an ORDERED disassembly sequence that minimizes total elapsed time
   for the yard period.

Hard rules — these override everything else:
- Items that block physical access to other work MUST come out first. Never
  sequence a plan where the crew gets halfway into a job and then discovers
  something else has to come out.
- Any item whose removal or recommissioning needs an external specialist
  contractor (refrigeration/AC, hydraulics, electronics calibration, etc.)
  MUST be flagged is_blocking=true with an estimated contractor_lead_time_days
  so the contractor gets booked BEFORE work begins. For AC / refrigeration
  assume 14 days unless visual evidence suggests otherwise.
- Make dependencies explicit via depends_on_seqs (the seq numbers that must be
  complete before a step can start).
- OVERHEAD CHECK: for every heavy item that will be lifted or craned out
  (engines, gensets, tanks), look straight up in the photos before writing its
  step. ANYTHING mounted above it — exhaust ducting, AC/chiller units, cable
  trays, piping runs — blocks the lift path and must be removed in an earlier
  step, with that step's seq listed in the lift step's depends_on_seqs. Never
  state that an item has a clear overhead path unless the photos genuinely
  show nothing above it.
- Do not invent equipment you cannot see or reasonably infer from the photos.
`.trim();

const buildUserPrompt = (areaName: string) => `
Area photographed: ${areaName}

Analyze the photos and return ONLY a JSON object — no markdown fences, no
prose — with exactly this shape:

{
  "summary": string (2-4 sentences: what you see, the overall strategy, and any contractor bookings to make immediately),
  "steps": [
    {
      "seq": integer (1-based order of execution),
      "title": string (short imperative, e.g. "Remove AC unit"),
      "description": string | null (how / why, access notes),
      "equipment_label": string | null (e.g. "Starboard AC unit"),
      "depends_on_seqs": integer[] (seq values that must be complete first; [] if none),
      "is_blocking": boolean (true if this must be scheduled before yard work begins),
      "external_contractor": string | null (specialist trade needed, e.g. "AC / refrigeration"),
      "contractor_lead_time_days": integer | null (booking lead time; AC/refrigeration ≈ 14),
      "est_hours": number | null (estimated labor hours),
      "flag_reason": string | null (why this step is flagged, e.g. "Blocks access to starboard engine; contractor lead time")
    }
  ]
}

Keep every description under 250 characters. Output nothing outside the JSON
object.
`.trim();

function stripFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

// Defensive parse of one AI step — bad fields degrade to null, never throw.
const aiStepSchema = z.object({
  seq: z.number().int().min(1),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(4000).nullable().catch(null),
  equipment_label: z.string().trim().max(200).nullable().catch(null),
  depends_on_seqs: z.array(z.number().int().min(1)).catch([]),
  is_blocking: z.boolean().catch(false),
  external_contractor: z.string().trim().max(200).nullable().catch(null),
  contractor_lead_time_days: z.number().int().min(0).max(365).nullable().catch(null),
  est_hours: z.number().min(0).max(10000).nullable().catch(null),
  flag_reason: z.string().trim().max(1000).nullable().catch(null),
});

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
  const { area_name, yard_period_id, photo_paths } = parsed.data;

  // Download each photo server-side (RLS: signed-in read) and base64 it into
  // ONE vision call — the model needs to see the whole area at once to order
  // the work correctly.
  const imageBlocks: Array<{
    type: "image";
    source: { type: "base64"; media_type: "image/jpeg"; data: string };
  }> = [];
  for (const path of photo_paths) {
    const { data: blob, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !blob) {
      console.error("photo download failed", { path, error });
      return NextResponse.json({ error: "photo_download_failed", path }, { status: 400 });
    }
    const b64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    imageBlocks.push({
      type: "image",
      // prepareImage always outputs JPEG, so uploads in this bucket are JPEG.
      source: { type: "base64", media_type: "image/jpeg", data: b64 },
    });
  }

  const anthropic = new Anthropic({
    apiKey: cleanEnv(process.env.ANTHROPIC_API_KEY),
  });

  let message;
  try {
    message = await anthropic.messages.create({
      model: MODEL,
      // Whole-vessel walkarounds produce 15-20 step plans; 8192 truncated the
      // JSON mid-array and the whole analysis failed to parse.
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            { type: "text", text: buildUserPrompt(area_name) },
          ] as unknown as Anthropic.MessageParam["content"],
        },
      ],
    });
  } catch (err) {
    console.error("anthropic call failed", err);
    return NextResponse.json({ error: "analysis_failed" }, { status: 500 });
  }

  if (message.stop_reason === "max_tokens") {
    console.error("drydock analyze truncated at max_tokens", {
      photos: photo_paths.length,
    });
    return NextResponse.json(
      { error: "parse_failed", raw: "AI response hit the output limit — try fewer photos per plan" },
      { status: 200 },
    );
  }

  const textBlock = message.content.find((b) => b.type === "text");
  const rawText = textBlock && "text" in textBlock ? textBlock.text : "";

  let raw: unknown;
  try {
    raw = JSON.parse(stripFences(rawText));
  } catch {
    return NextResponse.json(
      { error: "parse_failed", raw: rawText.slice(0, 2000) },
      { status: 200 },
    );
  }

  const obj = (raw ?? {}) as { summary?: unknown; steps?: unknown };
  const summary = typeof obj.summary === "string" ? obj.summary.slice(0, 4000) : null;
  const rawSteps = Array.isArray(obj.steps) ? obj.steps : [];
  const steps = rawSteps
    .map((s) => aiStepSchema.safeParse(s))
    .filter((r) => r.success)
    .map((r) => r.data);

  if (steps.length === 0) {
    return NextResponse.json(
      { error: "parse_failed", raw: "AI returned no usable steps" },
      { status: 200 },
    );
  }

  // Renumber sequentially (the model occasionally skips numbers) while
  // remapping depends_on_seqs through the same renumbering.
  steps.sort((a, b) => a.seq - b.seq);
  const seqMap = new Map<number, number>();
  steps.forEach((s, i) => seqMap.set(s.seq, i + 1));
  const normalized = steps.map((s, i) => ({
    ...s,
    seq: i + 1,
    depends_on_seqs: s.depends_on_seqs
      .map((d) => seqMap.get(d))
      .filter((d): d is number => d != null && d !== i + 1),
  }));

  const { data: plan, error: planErr } = await supabase
    .from("disassembly_plans")
    .insert({
      created_by: user.id,
      yard_period_id: yard_period_id ?? null,
      area_name,
      status: "draft",
      photo_paths,
      summary,
      model: MODEL,
    })
    .select()
    .single();

  if (planErr || !plan) {
    console.error("disassembly plan insert failed", planErr);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  const { data: stepRows, error: stepsErr } = await supabase
    .from("disassembly_steps")
    .insert(normalized.map((s) => ({ ...s, plan_id: plan.id })))
    .select();

  if (stepsErr || !stepRows) {
    console.error("disassembly steps insert failed", stepsErr);
    // Don't leave an empty plan behind.
    await supabase.from("disassembly_plans").delete().eq("id", plan.id);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "disassembly_plan",
    entity_id: plan.id,
    action: "create",
    after_state: { ...plan, steps: stepRows },
  });

  return NextResponse.json({ plan, steps: stepRows }, { status: 201 });
}
