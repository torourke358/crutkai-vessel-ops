import { createServiceClient } from "@/lib/supabase/server";

// One place to write audit_log rows. audit_log has no INSERT RLS policy, so
// every mutation route writes through the service-role client. Inserts return
// errors in the response object (not by throwing), so always inspect them —
// silently failing here means the audit trail goes dark.

type AuditEntry = {
  user_id: string;
  entity_type: string;
  entity_id: string;
  action: "create" | "update" | "delete";
  before_state?: unknown;
  after_state?: unknown;
};

export async function writeAudit(entry: AuditEntry): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("audit_log").insert(entry);
  if (error) {
    console.error("audit_log write failed", { entry, error });
  }
}
