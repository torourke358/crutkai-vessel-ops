import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { cleanEnv } from "@/lib/supabase/env";
import { getUserRole } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Read a photographed estimate or invoice.
//
// Craig photographs the vendor's paperwork on deck. For an ESTIMATE this is
// the one capture that produces both halves of the feature: the money record
// and a draft schedule, because the line items come back as jobs with a room
// and a trade attached, and the estimate's own dates become the window they
// sit in.
//
// ⚠ TAKES A STORAGE PATH, NEVER A URL. The same SSRF defence as the petty cash
// extract route: accepting an arbitrary URL would turn this into a
// server-side fetch for anywhere on the internet. The path must also be
// inside the caller's own folder, matching the bucket's per-user-folder RLS.
//
// ⚠ NOTHING IS SAVED HERE. This route only reads. A human checks every field
// on the review screen and presses save; the commit is a separate call to
// /api/yard-periods/[id]/estimates. That is deliberate — a misread total on a
// $290,000 quote is not something to let through on trust.
// ---------------------------------------------------------------------------

const MODEL = "claude-sonnet-5";
const BUCKET = "yard-documents";

const bodySchema = z.object({
  kind: z.enum(["estimate", "invoice"]),
  image_path: z.string().trim().min(1).max(500),
  // Zones and trades are passed in so the model picks from the vessel's real
  // vocabulary instead of inventing room names we then have to map.
  zones: z.array(z.string()).max(40).optional(),
  trades: z.array(z.string()).max(40).optional(),
});

function estimatePrompt(zones: string[], trades: string[]): string {
  return `You are reading a yard or refit ESTIMATE (a quote) for a 107ft motor yacht.

Extract it as JSON with exactly this shape:

{
  "vendor": string | null,          // the company quoting, e.g. "Roscioli Yachting Center"
  "reference": string | null,       // their quote or job number
  "amount": number | null,          // the TOTAL quoted, as a number with no symbols or commas
  "currency": string,               // ISO 4217; "USD" if not indicated
  "start_date": string | null,      // YYYY-MM-DD, when work begins, null if not stated
  "end_date": string | null,        // YYYY-MM-DD, when work ends, null if not stated
  "title": string | null,           // short description of the whole job, e.g. "Bottom, paint & topsides"
  "confidence": "high" | "medium" | "low",
  "jobs": [
    {
      "title": string,              // one line item, imperative, e.g. "Paint bottom"
      "amount": number | null,
      "zone": string | null,        // WHERE on the vessel, chosen from the list below
      "trade": string | null        // WHAT KIND of work, chosen from the list below
    }
  ]
}

Rooms on this vessel — use one of these exactly, or null if unclear:
${zones.join(", ")}

Trades — use one of these exactly, or null if unclear:
${trades.join(", ")}

Rules:
- The trade matters more than it looks: it is what decides whether two jobs can
  run at the same time. Sanding and spraying must be told apart. "Prep bottom"
  or "sand teak" is sanding; "paint", "spray", "topcoat" is spraying; varnish
  and satin finish are varnish; welding, cutting and grinding are hot work;
  engines, gensets, stabilizers, shafts and gearboxes are machinery.
- Hull and bottom work has no interior room. Leave zone null rather than
  guessing a room it does not happen in.
- Amounts: digits only. Read "$35,669.46" as 35669.46.
- If the sheet shows a subtotal plus fees or tax, "amount" is the FINAL total.
- Do not invent line items. If the sheet only gives a lump sum, return an empty
  jobs array rather than inventing a breakdown.
- Set a field to null when it is genuinely illegible, and lower the confidence.

Return only the JSON. No prose, no markdown fences.`;
}

function invoicePrompt(): string {
  return `You are reading a yard or refit INVOICE (a bill) for a 107ft motor yacht.

Extract it as JSON with exactly this shape:

{
  "vendor": string | null,       // the company billing
  "reference": string | null,    // the invoice number
  "amount": number | null,       // the TOTAL due, as a number with no symbols or commas
  "currency": string,            // ISO 4217; "USD" if not indicated
  "issued_date": string | null,  // YYYY-MM-DD, the invoice date
  "confidence": "high" | "medium" | "low",
  "notes": string | null         // one plain sentence on what the bill covers
}

Rules:
- Amounts: digits only. Read "$86,000.00" as 86000.
- If there is a subtotal plus tax or fees, "amount" is the FINAL amount due.
- A deposit request or a proforma is still an invoice — extract it the same way.
- Set a field to null when it is genuinely illegible, and lower the confidence.

Return only the JSON. No prose, no markdown fences.`;
}

function stripFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

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
  const { kind, image_path, zones, trades } = parsed.data;

  // Own-folder only. The bucket's RLS says the same thing; this makes it a
  // clean 403 instead of an empty download.
  if (!image_path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "forbidden_path" }, { status: 403 });
  }

  // Download server-side and send bytes, rather than handing Anthropic a
  // signed URL it may not be able to reach. Same approach as the drydock
  // planner. prepareImage() on the client guarantees these are JPEG.
  const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(image_path);
  if (dlErr || !blob) {
    console.error("yard document download failed", dlErr);
    return NextResponse.json({ error: "download_failed" }, { status: 404 });
  }
  const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");

  const prompt =
    kind === "estimate"
      ? estimatePrompt(
          zones ?? [],
          trades ?? [],
        )
      : invoicePrompt();

  const anthropic = new Anthropic({ apiKey: cleanEnv(process.env.ANTHROPIC_API_KEY) });

  let message;
  try {
    message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
            { type: "text", text: prompt },
          ],
        },
      ],
    });
  } catch (err) {
    console.error("anthropic call failed", err);
    return NextResponse.json({ error: "extraction_failed" }, { status: 500 });
  }

  if (message.stop_reason === "max_tokens") {
    return NextResponse.json(
      { error: "parse_failed", raw: "The estimate was too long to read in one pass." },
      { status: 200 },
    );
  }

  const textBlock = message.content.find((b) => b.type === "text");
  const rawText = textBlock && "text" in textBlock ? textBlock.text : "";

  let data: unknown;
  try {
    data = JSON.parse(stripFences(rawText));
  } catch {
    // ⚠ 200, not 500, on purpose: the petty cash contract. An unreadable photo
    // must drop the user into a blank manual form, not an error page.
    return NextResponse.json(
      { error: "parse_failed", raw: rawText.slice(0, 2000) },
      { status: 200 },
    );
  }

  return NextResponse.json({ kind, extraction: data, model: MODEL });
}
