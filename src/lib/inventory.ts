// Shared inventory helpers. Status is computed at read time — never stored.

export type InventoryStatus = "ok" | "critical" | "no_stock";

export function computeStatus(
  quantity: number,
  criticalThreshold: number | null,
): InventoryStatus {
  if (quantity === 0) return "no_stock";
  if (criticalThreshold != null && quantity <= criticalThreshold) return "critical";
  return "ok";
}

export const STATUS_LABELS: Record<InventoryStatus, string> = {
  ok: "OK",
  critical: "Critical",
  no_stock: "No stock",
};

export const STATUS_BADGE_CLASS: Record<InventoryStatus, string> = {
  ok: "bg-emerald-100 text-emerald-800",
  critical: "bg-amber-100 text-amber-800",
  no_stock: "bg-rose-100 text-rose-800",
};
