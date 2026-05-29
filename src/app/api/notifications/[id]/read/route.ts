import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error, count } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", id)
    .eq("channel", "in_app")
    .eq("recipient_id", user.id);

  if (error) {
    console.error("notification mark-read failed", error);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
