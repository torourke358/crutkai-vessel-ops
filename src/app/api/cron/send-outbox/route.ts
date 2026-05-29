import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { buildEmailHtml, getResend, isCronAuthorized } from "@/lib/resend";

export const dynamic = "force-dynamic";

interface PendingRow {
  id: string;
  subject: string;
  body: string;
  recipient_email: string | null;
}

// GET /api/cron/send-outbox
// Drains up to 25 pending email notifications per run via Resend.
// Single-shot per row: success -> sent, exception -> failed (no retry v1).
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Read the active email_from from app_settings (set in 01_vessel_ops_schema.sql)
  const { data: fromSetting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "vessel_email_from")
    .maybeSingle();
  const { data: fromNameSetting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "vessel_email_from_name")
    .maybeSingle();

  const fromEmail = (fromSetting?.value as string | null) ?? "onboarding@resend.dev";
  const fromName = (fromNameSetting?.value as string | null) ?? "Anne-Marie Ops";

  const { data: pending, error } = await supabase
    .from("notifications")
    .select("id, subject, body, recipient_email")
    .eq("channel", "email")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(25)
    .returns<PendingRow[]>();

  if (error) {
    console.error("cron send-outbox: fetch failed", error);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  const resend = getResend();
  let sent = 0;
  let failed = 0;

  for (const row of pending ?? []) {
    if (!row.recipient_email) {
      await supabase
        .from("notifications")
        .update({ status: "failed", error: "no recipient_email" })
        .eq("id", row.id);
      failed++;
      continue;
    }
    try {
      const { error: sendErr } = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: row.recipient_email,
        subject: row.subject,
        html: buildEmailHtml(row.subject, row.body),
      });
      if (sendErr) {
        throw new Error(sendErr.message);
      }
      await supabase
        .from("notifications")
        .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
        .eq("id", row.id);
      sent++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase
        .from("notifications")
        .update({ status: "failed", error: msg.slice(0, 500) })
        .eq("id", row.id);
      failed++;
    }
  }

  return NextResponse.json({ sent, failed, pending: (pending ?? []).length });
}
