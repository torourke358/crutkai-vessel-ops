import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import NotificationListClient from "@/components/NotificationListClient";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  kind: string;
  subject: string;
  body: string;
  related_type: string | null;
  related_id: string | null;
  read_at: string | null;
  created_at: string;
}

export default async function NotificationsPage() {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("notifications")
    .select("id, kind, subject, body, related_type, related_id, read_at, created_at")
    .eq("channel", "in_app")
    .order("created_at", { ascending: false })
    .returns<Row[]>();

  const items = (rows ?? []).map((r) => ({
    ...r,
    createdLabel: formatDate(r.created_at.slice(0, 10)),
  }));

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Notifications</h1>
        <Link
          href="/notifications/settings"
          className="text-sm font-medium text-slate-500 hover:text-violet-700"
        >
          Settings
        </Link>
      </div>

      <NotificationListClient items={items} />
    </div>
  );
}
