import { format } from "date-fns";

// Money: group thousands, always 2 decimals, with the currency code suffix.
export function formatAmount(
  amount: number | null,
  currency: string | null,
): string {
  if (amount == null) return "—";
  const n = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${n} ${currency ?? "USD"}`;
}

// Dates come back as "YYYY-MM-DD" (date column) — render as "12 Mar 2026".
// Parse manually so the value is anchored to local time (noon to dodge DST),
// not UTC midnight (which would render as the previous day in negative-offset
// time zones).
export function formatDate(value: string | null): string {
  if (!value) return "No date";
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return format(new Date(y, m - 1, d, 12), "d MMM yyyy");
}

// Today's date in the user's local time zone as "YYYY-MM-DD". Avoid
// `new Date().toISOString().slice(0,10)` — that returns the UTC date.
export function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// First day of the current month, local time, as "YYYY-MM-DD".
export function monthStartLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}
