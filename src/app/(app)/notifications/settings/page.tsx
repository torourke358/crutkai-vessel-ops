import { createClient } from "@/lib/supabase/server";
import NotificationSettingsForm from "@/components/NotificationSettingsForm";
import type { NotificationSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: row } = await supabase
    .from("notification_settings")
    .select()
    .eq("user_id", user!.id)
    .maybeSingle<NotificationSettings>();

  const initial: NotificationSettings = row ?? {
    user_id: user!.id,
    inventory_in_app: true,
    inventory_email: false,
    maintenance_in_app: false,
    maintenance_email: false,
    updated_at: new Date().toISOString(),
  };

  return <NotificationSettingsForm initial={initial} />;
}
