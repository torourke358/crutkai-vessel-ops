import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { cleanEnv } from "@/lib/supabase/env";

// POST /api/yard/ask — natural-language Q&A over the vessel's own records.
// The crew asks e.g. "when was the last time I used varnish?"; we pull the
// matching yard tasks (work + cost), maintenance tasks (cost + last done), and
// inventory purchases, then Claude narrates the dates and dollar amounts. It
// only describes records that exist — it never invents history.

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `
You are the Runa yacht's maintenance assistant. Answer the crew's question using
ONLY the records you are given (yard tasks, maintenance tasks, parts consumed on
jobs, and inventory purchases — each with dates and, where present, USD costs).

Rules:
- Cite specific dates and dollar amounts straight from the records.
- When useful, also say how long ago ("about 5 years ago") using the provided
  "today" date.
- Separate USAGE (yard/maintenance work where an item was used) from PURCHASES
  (inventory the vessel bought).
- If the records contain nothing relevant, say you have no record of it.
- NEVER invent dates, costs, items, or quantities. Keep it concise and factual.
`.trim();

const STOPWORDS = new Set([
  "when", "what", "where", "which", "last", "time", "times", "used", "using", "use",
  "much", "many", "cost", "costs", "have", "has", "had", "this", "that", "there",
  "with", "from", "about", "total", "paid", "year", "years", "ago", "did", "does",
  "the", "and", "for", "was", "were", "how", "long", "since", "recent", "recently",
  "purchase", "purchased", "buy", "bought", "spend", "spent", "money", "show",
  "give", "tell", "list", "been", "into", "over", "your", "you", "are", "our",
]);

function extractKeywords(q: string): string[] {
  return [
    ...new Set(
      q
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
    ),
  ].slice(0, 6);
}

function orFilter(fields: string[], keywords: string[]): string {
  const parts: string[] = [];
  for (const kw of keywords) for (const f of fields) parts.push(`${f}.ilike.%${kw}%`);
  return parts.join(",");
}

interface ItemLite {
  part_name: string | null;
  unit: string | null;
  unit_price: number | null;
}
interface ConsumedRow {
  qty_used: number | null;
  recorded_at: string;
  source_type: string | null;
  inventory_item: ItemLite | ItemLite[] | null;
}
const one = (x: ItemLite | ItemLite[] | null): ItemLite | null =>
  Array.isArray(x) ? x[0] ?? null : x;
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let question = "";
  try {
    question = String((await req.json())?.question ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  if (!question) return NextResponse.json({ error: "Ask a question" }, { status: 400 });

  const keywords = extractKeywords(question);
  if (keywords.length === 0) {
    return NextResponse.json({
      answer:
        "Tell me which item you mean — for example, “when did I last use varnish?” or “how much have I spent on antifouling?”",
    });
  }

  const [{ data: yardTasks }, { data: maint }, { data: inventory }] = await Promise.all([
    supabase
      .from("yard_tasks")
      .select("title, description, status, actual_cost, completed_at, due_date, created_at")
      .or(orFilter(["title", "description", "resources"], keywords))
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(40),
    supabase
      .from("maintenance_tasks")
      .select("title, description, cost, last_done_date, created_at")
      .or(orFilter(["title", "description"], keywords))
      .order("last_done_date", { ascending: false, nullsFirst: false })
      .limit(40),
    supabase
      .from("inventory_items")
      .select("id, part_name, make, supplier, unit, quantity, unit_price, created_at, updated_at")
      .or(orFilter(["part_name", "make", "supplier", "notes"], keywords))
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  // Parts actually consumed on jobs for the matched inventory items — the most
  // precise "what did I use, when, and for how much" signal (qty × unit price).
  const invIds = (inventory ?? []).map((i) => i.id).filter(Boolean);
  let consumed: ConsumedRow[] = [];
  if (invIds.length) {
    const { data } = await supabase
      .from("parts_consumed")
      .select("qty_used, recorded_at, source_type, inventory_item:inventory_items(part_name, unit, unit_price)")
      .in("inventory_item_id", invIds)
      .order("recorded_at", { ascending: false })
      .limit(40)
      .returns<ConsumedRow[]>();
    consumed = data ?? [];
  }

  // Compact, server-side summary — only the fields the model needs.
  const summary = {
    today: new Date().toISOString().slice(0, 10),
    keywords,
    usage_yard_tasks: (yardTasks ?? []).map((t) => ({
      title: t.title,
      notes: t.description,
      status: t.status,
      cost_usd: t.actual_cost,
      date: t.completed_at ?? t.due_date ?? t.created_at,
    })),
    usage_maintenance: (maint ?? []).map((m) => ({
      title: m.title,
      notes: m.description,
      estimated_cost_usd: m.cost,
      last_done: m.last_done_date,
    })),
    purchases_inventory: (inventory ?? []).map((i) => ({
      item: i.part_name,
      make: i.make,
      supplier: i.supplier,
      quantity: i.quantity,
      unit: i.unit,
      unit_price_usd: i.unit_price,
      added_on: i.created_at,
    })),
    usage_parts_consumed: consumed.map((p) => {
      const ii = one(p.inventory_item);
      return {
        item: ii?.part_name,
        qty: p.qty_used,
        unit: ii?.unit,
        unit_price_usd: ii?.unit_price,
        line_cost_usd:
          p.qty_used != null && ii?.unit_price != null ? r2(p.qty_used * ii.unit_price) : null,
        date: p.recorded_at,
        used_on: p.source_type, // "yard" | "maintenance"
      };
    }),
  };

  let answer = "";
  try {
    const anthropic = new Anthropic({ apiKey: cleanEnv(process.env.ANTHROPIC_API_KEY) });
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Records (JSON):\n${JSON.stringify(summary)}\n\nQuestion: ${question}`,
        },
      ],
    });
    answer = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();
  } catch (err) {
    return NextResponse.json(
      { error: "Assistant request failed", detail: String(err) },
      { status: 502 },
    );
  }

  const found =
    summary.usage_yard_tasks.length +
    summary.usage_maintenance.length +
    summary.purchases_inventory.length +
    summary.usage_parts_consumed.length;

  return NextResponse.json({ answer, matched: found });
}
