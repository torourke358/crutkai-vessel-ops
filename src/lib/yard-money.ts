import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  YardCurrency,
  YardEstimate,
  YardInvoice,
  YardPayment,
  YardVendor,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// What a yard period costs, and what is still owed on it.
//
//   committed      = Σ estimates   — what the vendors quoted
//   billed         = Σ invoices    — what they have actually billed
//   paid           = Σ payments    — cash out; a deposit is a payment
//   outstanding    = billed − paid       — the running balance Craig asked for
//   still to come  = committed − billed  — quoted work not yet billed
//
// Nothing here is stored. Every figure is arithmetic over the three tables, so
// there is no cached total that can drift away from the rows underneath it —
// the same discipline as getMonthlyStatement() in the petty cash app.
//
// ⚠ CURRENCIES ARE NEVER SUMMED TOGETHER. Each estimate carries its own, and
// invoices and payments inherit it from their estimate. A period with work in
// two currencies returns two blocks; there is deliberately no grand total,
// because adding dollars to euros produces a number that means nothing.
//
// ⚠ This is the YARD ledger. It shares a database with crutkai-petty-cash and
// must never touch it: the yard is a capital project on a 5–10 year cycle,
// petty cash is the yearly operating float. Nothing in this file reads a
// petty cash table.
// ---------------------------------------------------------------------------

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface VendorRollup {
  vendor_id: string | null;
  vendor_name: string;
  estimate_count: number;
  committed: number;
  billed: number;
  paid: number;
  outstanding: number;
  still_to_come: number;
}

export interface CurrencyBlock {
  currency: YardCurrency;
  committed: number;
  billed: number;
  paid: number;
  outstanding: number;
  still_to_come: number;
  vendors: VendorRollup[];
}

export interface YardMoney {
  /** One block per currency in play, busiest first. Never summed together. */
  blocks: CurrencyBlock[];
  estimates: YardEstimate[];
  invoices: YardInvoice[];
  payments: YardPayment[];
  vendorsById: Map<string, YardVendor>;
  /** True when more than one currency appears — the UI drops any grand total. */
  mixedCurrency: boolean;
}

/**
 * Per-estimate figures. Exported because the estimates list shows the same
 * four numbers per row that the money tab shows per vendor.
 */
export interface EstimateRollup {
  committed: number;
  billed: number;
  paid: number;
  outstanding: number;
  still_to_come: number;
}

export function rollUpEstimate(
  estimate: YardEstimate,
  invoices: YardInvoice[],
  payments: YardPayment[],
): EstimateRollup {
  const committed = Number(estimate.amount ?? 0);
  const billed = invoices
    .filter((i) => i.estimate_id === estimate.id)
    .reduce((sum, i) => sum + Number(i.amount), 0);
  const paid = payments
    .filter((p) => p.estimate_id === estimate.id)
    .reduce((sum, p) => sum + Number(p.amount), 0);
  return {
    committed: round2(committed),
    billed: round2(billed),
    paid: round2(paid),
    outstanding: round2(billed - paid),
    still_to_come: round2(committed - billed),
  };
}

/**
 * Everything the money tab needs for one yard period, in four queries.
 *
 * Invoices and payments are grouped through their estimate, which is what
 * carries the currency. A row with no estimate (possible: `on delete set null`
 * if an estimate is ever removed) is folded into an "Unassigned" vendor in the
 * period's dominant currency rather than being silently dropped — money that
 * has left the account must always appear somewhere.
 */
export async function getYardMoney(
  supabase: SupabaseClient,
  yardPeriodId: string,
): Promise<YardMoney> {
  const [{ data: estimates }, { data: invoices }, { data: payments }, { data: vendors }] =
    await Promise.all([
      supabase
        .from("yard_estimates")
        .select()
        .eq("yard_period_id", yardPeriodId)
        .order("start_date", { ascending: true, nullsFirst: false })
        .returns<YardEstimate[]>(),
      supabase
        .from("yard_invoices")
        .select()
        .eq("yard_period_id", yardPeriodId)
        .order("issued_date", { ascending: true, nullsFirst: false })
        .returns<YardInvoice[]>(),
      supabase
        .from("yard_payments")
        .select()
        .eq("yard_period_id", yardPeriodId)
        .order("paid_date", { ascending: true, nullsFirst: false })
        .returns<YardPayment[]>(),
      supabase.from("yard_vendors").select().order("name").returns<YardVendor[]>(),
    ]);

  const est = estimates ?? [];
  const inv = invoices ?? [];
  const pay = payments ?? [];
  const vendorsById = new Map((vendors ?? []).map((v) => [v.id, v]));

  // Which currency does each estimate sit in, and which estimate does each
  // invoice/payment belong to.
  const currencyOf = new Map<string, YardCurrency>();
  for (const e of est) currencyOf.set(e.id, e.currency);

  // The dominant currency is the fallback home for orphaned rows.
  const byCount = new Map<YardCurrency, number>();
  for (const e of est) byCount.set(e.currency, (byCount.get(e.currency) ?? 0) + 1);
  const dominant: YardCurrency =
    [...byCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";

  type Bucket = {
    committed: number;
    billed: number;
    paid: number;
    vendorName: string;
    estimate_count: number;
  };
  // currency -> vendor_id (or "unassigned") -> bucket
  const grid = new Map<YardCurrency, Map<string, Bucket>>();

  const bucket = (currency: YardCurrency, vendorId: string | null): Bucket => {
    let byVendor = grid.get(currency);
    if (!byVendor) {
      byVendor = new Map();
      grid.set(currency, byVendor);
    }
    const key = vendorId ?? "unassigned";
    let b = byVendor.get(key);
    if (!b) {
      b = {
        committed: 0,
        billed: 0,
        paid: 0,
        estimate_count: 0,
        vendorName: vendorId
          ? (vendorsById.get(vendorId)?.name ?? "Unknown vendor")
          : "Unassigned",
      };
      byVendor.set(key, b);
    }
    return b;
  };

  const vendorOfEstimate = new Map<string, string | null>();
  for (const e of est) {
    vendorOfEstimate.set(e.id, e.vendor_id);
    const b = bucket(e.currency, e.vendor_id);
    b.committed += Number(e.amount ?? 0);
    b.estimate_count += 1;
  }
  for (const i of inv) {
    const cur = (i.estimate_id && currencyOf.get(i.estimate_id)) || dominant;
    const ven = i.estimate_id ? (vendorOfEstimate.get(i.estimate_id) ?? null) : null;
    bucket(cur, ven).billed += Number(i.amount);
  }
  for (const p of pay) {
    const cur = (p.estimate_id && currencyOf.get(p.estimate_id)) || dominant;
    const ven = p.estimate_id ? (vendorOfEstimate.get(p.estimate_id) ?? null) : null;
    bucket(cur, ven).paid += Number(p.amount);
  }

  const blocks: CurrencyBlock[] = [...grid.entries()]
    .map(([currency, byVendor]) => {
      const vendorRows: VendorRollup[] = [...byVendor.entries()]
        .map(([key, b]) => ({
          vendor_id: key === "unassigned" ? null : key,
          vendor_name: b.vendorName,
          estimate_count: b.estimate_count,
          committed: round2(b.committed),
          billed: round2(b.billed),
          paid: round2(b.paid),
          outstanding: round2(b.billed - b.paid),
          still_to_come: round2(b.committed - b.billed),
        }))
        .sort((a, b) => b.committed - a.committed);

      const sum = (pick: (v: VendorRollup) => number) =>
        round2(vendorRows.reduce((t, v) => t + pick(v), 0));

      return {
        currency,
        committed: sum((v) => v.committed),
        billed: sum((v) => v.billed),
        paid: sum((v) => v.paid),
        outstanding: sum((v) => v.outstanding),
        still_to_come: sum((v) => v.still_to_come),
        vendors: vendorRows,
      };
    })
    .sort((a, b) => b.committed - a.committed);

  return {
    blocks,
    estimates: est,
    invoices: inv,
    payments: pay,
    vendorsById,
    mixedCurrency: blocks.length > 1,
  };
}
