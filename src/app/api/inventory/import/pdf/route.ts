import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { cleanEnv } from "@/lib/supabase/env";
import { getUserRole } from "@/lib/auth";

const MODEL = "claude-sonnet-5";

const EXTRACT_PROMPT = `You are reading a Seahub inventory export PDF for a yacht.

Extract EVERY row in the table(s). Return ONLY a JSON array of rows. Each row:

{
  "part_name": string (required),
  "part_number": string | null,
  "make": string | null,
  "quantity": integer (parse "8 Units" as 8, "100 Units" as 100, blank as 0),
  "unit": string (default "Units"),
  "location": string | null,
  "related_component": string | null (e.g. "Hose", "AC", "AV", "Lights", "Electric", "Pumps", "Safety", "Fenders"),
  "critical_threshold": integer | null
}

Rules:
- If quantity is blank, return 0.
- If a cell is blank or unreadable, return null (except quantity → 0 and part_name → required).
- Do not invent values.
- No markdown fences. No prose. Just the JSON array.`;

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

  let pdfBase64: string;
  let mediaType: "application/pdf" | "image/jpeg" | "image/png";
  try {
    const body = (await request.json()) as { pdf_base64?: string; image_base64?: string; media_type?: string };
    if (body.pdf_base64) {
      pdfBase64 = body.pdf_base64;
      mediaType = "application/pdf";
    } else if (body.image_base64) {
      pdfBase64 = body.image_base64;
      const m = (body.media_type ?? "image/jpeg").toLowerCase();
      mediaType = m === "image/png" ? "image/png" : "image/jpeg";
    } else {
      return NextResponse.json({ error: "missing_file" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const anthropic = new Anthropic({
    apiKey: cleanEnv(process.env.ANTHROPIC_API_KEY),
  });

  type ContentBlock =
    | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
    | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png"; data: string } }
    | { type: "text"; text: string };

  const content: ContentBlock[] =
    mediaType === "application/pdf"
      ? [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          },
          { type: "text", text: EXTRACT_PROMPT },
        ]
      : [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: pdfBase64 },
          },
          { type: "text", text: EXTRACT_PROMPT },
        ];

  let message;
  try {
    message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: content as unknown as Anthropic.MessageParam["content"],
        },
      ],
    });
  } catch (err) {
    console.error("anthropic call failed", err);
    return NextResponse.json({ error: "extraction_failed" }, { status: 500 });
  }

  const textBlock = message.content.find((b) => b.type === "text");
  const rawText = textBlock && "text" in textBlock ? textBlock.text : "";

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(rawText));
  } catch {
    return NextResponse.json(
      { error: "parse_failed", raw: rawText.slice(0, 2000) },
      { status: 200 },
    );
  }

  if (!Array.isArray(parsed)) {
    return NextResponse.json(
      { error: "parse_failed", raw: "AI did not return a JSON array" },
      { status: 200 },
    );
  }

  return NextResponse.json({ rows: parsed, count: parsed.length });
}
