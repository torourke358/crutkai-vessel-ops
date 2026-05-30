import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { PDFDocument } from "pdf-lib";
import { cleanEnv } from "@/lib/supabase/env";
import { getUserRole } from "@/lib/auth";

const MODEL = "claude-sonnet-4-6";
const PAGES_PER_CHUNK = 3; // ~3 PDF pages per Claude call keeps output token usage manageable

const EXTRACT_PROMPT = `You are reading a Seahub MAINTENANCE TASKS export PDF for a yacht.

Extract EVERY row across every page. Return ONLY a JSON array of rows. Each row:

{
  "title": string (the "Task" column, e.g. "5 Yearly Service"),
  "equipment_name": string (the "Component" column, e.g. "Gearbox (Port)"),
  "system": string | null (the "System" column, e.g. "Propulsion"),
  "priority": "low" | "moderate" | "high" | "critical" | null,
  "last_completed": "YYYY-MM-DD" | null,
  "next_due": "YYYY-MM-DD" | null,
  "due_type": "calendar" | "hours",
  "interval_days": integer | null,
  "interval_hours": integer | null
}

Rules:
- If the row has a calendar Next Due / Last Completed date, set due_type="calendar".
- If the row references hours (e.g. "Due at 1500 hrs"), set due_type="hours" and use interval_hours.
- Default due_type="calendar" if unsure.
- Parse dates as YYYY-MM-DD. Common Seahub format is "Jan 1, 2027".
- If a date cell is blank, return null.
- Priority values: Low / Moderate / High / Critical → lowercase.
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
  try {
    const body = (await request.json()) as { pdf_base64?: string };
    if (!body.pdf_base64) {
      return NextResponse.json({ error: "missing_pdf" }, { status: 400 });
    }
    pdfBase64 = body.pdf_base64;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Split the PDF into N-page chunks so each Claude call's output fits comfortably
  // under the 8192-token max even for a row-dense page.
  const pdfBytes = Buffer.from(pdfBase64, "base64");
  let sourceDoc;
  try {
    sourceDoc = await PDFDocument.load(pdfBytes);
  } catch (err) {
    console.error("pdf load failed", err);
    return NextResponse.json({ error: "invalid_pdf" }, { status: 400 });
  }
  const total = sourceDoc.getPageCount();

  const anthropic = new Anthropic({ apiKey: cleanEnv(process.env.ANTHROPIC_API_KEY) });

  type ExtractedRow = Record<string, unknown>;
  const allRows: ExtractedRow[] = [];
  const errors: { chunk: string; reason: string }[] = [];

  for (let start = 0; start < total; start += PAGES_PER_CHUNK) {
    const end = Math.min(start + PAGES_PER_CHUNK, total);
    const chunkDoc = await PDFDocument.create();
    const indices = Array.from({ length: end - start }, (_, i) => start + i);
    const copied = await chunkDoc.copyPages(sourceDoc, indices);
    for (const p of copied) chunkDoc.addPage(p);
    const chunkBytes = await chunkDoc.save();
    const chunkBase64 = Buffer.from(chunkBytes).toString("base64");

    try {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: chunkBase64,
                },
              },
              { type: "text", text: EXTRACT_PROMPT },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ] as any,
          },
        ],
      });

      const textBlock = message.content.find((b) => b.type === "text");
      const rawText = textBlock && "text" in textBlock ? textBlock.text : "";
      const parsed = JSON.parse(stripFences(rawText));
      if (Array.isArray(parsed)) {
        allRows.push(...(parsed as ExtractedRow[]));
      } else {
        errors.push({ chunk: `${start + 1}-${end}`, reason: "non-array response" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ chunk: `${start + 1}-${end}`, reason: msg.slice(0, 200) });
    }
  }

  return NextResponse.json({
    pages: total,
    chunks: Math.ceil(total / PAGES_PER_CHUNK),
    rows: allRows,
    count: allRows.length,
    errors,
  });
}
