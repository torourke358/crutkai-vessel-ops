import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

// Any signed-in user can record an hours reading. Updating equipment.current_hours
// auto-fires the log_equipment_hours trigger which inserts the reading row.
const bodySchema = z.object({
  hours: z.number().int().min(0),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
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

  const { data: before } = await supabase
    .from("equipment")
    .select("id, current_hours")
    .eq("id", id)
    .single();
  if (!before) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Refuse a regression — hours only ever go up. Fast-path check for a clear
  // error message; the atomic guard below is what actually holds the invariant.
  if (before.current_hours != null && parsed.data.hours < before.current_hours) {
    return NextResponse.json(
      {
        error: "hours_regression",
        message: `New reading (${parsed.data.hours}) is below current (${before.current_hours}).`,
      },
      { status: 422 },
    );
  }

  // Apply only when our reading is >= the stored value (or it's unset). Doing
  // the comparison inside the WHERE makes "hours only go up" race-safe: if two
  // people record readings at the same moment, the lower one matches zero rows
  // instead of clobbering the higher one. (PostgREST ANDs the .or with .eq.)
  const { data: after, error, count } = await supabase
    .from("equipment")
    .update({ current_hours: parsed.data.hours }, { count: "exact" })
    .eq("id", id)
    .or(`current_hours.is.null,current_hours.lte.${parsed.data.hours}`)
    .select()
    .maybeSingle();

  if (error) {
    console.error("hour reading update failed", error);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
  if (!count || !after) {
    // Zero rows: either RLS blocked the write, or a concurrent higher reading
    // landed between our read and write (our value is now a regression).
    // Re-read to tell them apart and return an accurate message.
    const { data: current } = await supabase
      .from("equipment")
      .select("current_hours")
      .eq("id", id)
      .single();
    if (
      current &&
      current.current_hours != null &&
      parsed.data.hours < current.current_hours
    ) {
      return NextResponse.json(
        {
          error: "hours_regression",
          message: `A higher reading (${current.current_hours}) was just recorded; ${parsed.data.hours} would be a regression.`,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await writeAudit({
    user_id: user.id,
    entity_type: "equipment_hour_reading",
    entity_id: id,
    action: "create",
    after_state: { hours: parsed.data.hours, equipment_id: id },
  });

  return NextResponse.json(after);
}
