import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Own in-app notifications (RLS scopes them by recipient_id). Returns recent
// 50 with unread first.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: rows, error } = await supabase
    .from("notifications")
    .select("id, kind, subject, body, related_type, related_id, read_at, created_at")
    .eq("channel", "in_app")
    .order("read_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("notifications list failed", error);
    return NextResponse.json({ error: "list_failed" }, { status: 500 });
  }

  return NextResponse.json({
    items: rows ?? [],
    unread: (rows ?? []).filter((r) => !r.read_at).length,
  });
}
