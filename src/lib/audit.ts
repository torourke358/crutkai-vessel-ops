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

// Bulk variant for import commits. A 500-row import that calls writeAudit()
// per row costs 500 sequential round-trips and blows the function timeout
// long before it finishes; one insert of 500 entries costs one. Same
// swallow-and-log contract as writeAudit — a dark audit trail must never
// fail the mutation that was already committed.
export async function writeAuditMany(entries: AuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const service = createServiceClient();
  const { error } = await service.from("audit_log").insert(entries);
  if (error) {
    console.error("audit_log bulk write failed", { count: entries.length, error });
  }
}
