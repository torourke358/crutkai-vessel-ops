import { formatAmount, formatDate } from "@/lib/format";
import { YARD_PAYMENT_KIND_LABELS, type YardPaymentKind } from "@/lib/types";
import type { YardMoney } from "@/lib/yard-money";

// Where the money on a yard period stands, read top to bottom.
//
// One block per currency. There is deliberately NO grand total across
// currencies — adding dollars to euros produces a number that means nothing,
// and the petty cash statement makes the same refusal for the same reason.

type Movement = {
  id: string;
  date: string | null;
  vendor: string;
  kind: "invoice" | YardPaymentKind;
  label: string;
  reference: string | null;
  billed: number | null;
  paid: number | null;
  currency: string;
};

export default function YardMoneyStatement({ money }: { money: YardMoney }) {
  const { blocks, estimates, invoices, payments, vendorsById } = money;

  if (blocks.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-400 ring-1 ring-slate-100">
        No money recorded against this yard period yet. Capture an estimate to start.
      </div>
    );
  }

  const estimateById = new Map(estimates.map((e) => [e.id, e]));
  const vendorOf = (estimateId: string | null): string => {
    if (!estimateId) return "Unassigned";
    const est = estimateById.get(estimateId);
    if (!est?.vendor_id) return "Unassigned";
    return vendorsById.get(est.vendor_id)?.name ?? "Unknown vendor";
  };
  const currencyOf = (estimateId: string | null): string =>
    (estimateId && estimateById.get(estimateId)?.currency) || blocks[0].currency;

  const movements: Movement[] = [
    ...invoices.map((i) => ({
      id: `i-${i.id}`,
      date: i.issued_date,
      vendor: vendorOf(i.estimate_id),
      kind: "invoice" as const,
      label: i.notes?.trim() || estimateById.get(i.estimate_id ?? "")?.title || "Invoice",
      reference: i.reference,
      billed: Number(i.amount),
      paid: null,
      currency: currencyOf(i.estimate_id),
    })),
    ...payments.map((p) => ({
      id: `p-${p.id}`,
      date: p.paid_date,
      vendor: vendorOf(p.estimate_id),
      kind: p.kind,
      label: p.notes?.trim() || estimateById.get(p.estimate_id ?? "")?.title || "Payment",
      reference: p.reference,
      billed: null,
      paid: Number(p.amount),
      currency: currencyOf(p.estimate_id),
    })),
  ].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));

  return (
    <div className="space-y-4">
      {money.mixedCurrency && (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
          This period has work in more than one currency. Each is totalled on its own — they are
          never added together.
        </p>
      )}

      {blocks.map((b) => (
        <div
          key={b.currency}
          className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Where the period stands{money.mixedCurrency ? ` — ${b.currency}` : ""}
            </h2>
            <p className="text-xs text-slate-400">
              billed − paid = outstanding · committed − billed = still to come
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2 font-medium">Vendor</th>
                  <th className="px-4 py-2 text-right font-medium">Quoted</th>
                  <th className="px-4 py-2 text-right font-medium">Billed</th>
                  <th className="px-4 py-2 text-right font-medium">Paid</th>
                  <th className="px-4 py-2 text-right font-medium">Outstanding</th>
                  <th className="px-4 py-2 text-right font-medium">Still to come</th>
                </tr>
              </thead>
              <tbody>
                {b.vendors.map((v) => (
                  <tr key={v.vendor_id ?? "unassigned"} className="border-b border-slate-50">
                    <td className="px-4 py-2.5 text-slate-700">{v.vendor_name}</td>
                    <Money v={v.committed} c={b.currency} />
                    <Money v={v.billed} c={b.currency} />
                    <Money v={v.paid} c={b.currency} tone={v.paid > 0 ? "ok" : undefined} />
                    <Money
                      v={v.outstanding}
                      c={b.currency}
                      tone={v.outstanding > 0 ? "due" : undefined}
                    />
                    <Money v={v.still_to_come} c={b.currency} />
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-900 font-semibold">
                  <td className="px-4 py-3 text-slate-900">Total</td>
                  <Money v={b.committed} c={b.currency} bold />
                  <Money v={b.billed} c={b.currency} bold />
                  <Money v={b.paid} c={b.currency} bold tone="ok" />
                  <Money
                    v={b.outstanding}
                    c={b.currency}
                    bold
                    tone={b.outstanding > 0 ? "due" : undefined}
                  />
                  <Money v={b.still_to_come} c={b.currency} bold />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Every movement, oldest first</h2>
        </div>
        {movements.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">
            No invoices or payments recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Vendor</th>
                  <th className="px-4 py-2 font-medium">What</th>
                  <th className="px-4 py-2 font-medium">Reference</th>
                  <th className="px-4 py-2 text-right font-medium">Billed</th>
                  <th className="px-4 py-2 text-right font-medium">Paid</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-b border-slate-50">
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-600">
                      {m.date ? formatDate(m.date) : "No date"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{m.vendor}</td>
                    <td className="px-4 py-2.5 text-slate-700">
                      <span
                        className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                          m.kind === "invoice"
                            ? "bg-slate-100 text-slate-600"
                            : m.kind === "deposit"
                              ? "bg-violet-50 text-violet-700"
                              : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {m.kind === "invoice"
                          ? "Invoice"
                          : YARD_PAYMENT_KIND_LABELS[m.kind as YardPaymentKind]}
                      </span>
                      {m.label}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-slate-500">
                      {m.reference ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-900">
                      {m.billed == null ? "—" : formatAmount(m.billed, m.currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">
                      {m.paid == null ? "—" : formatAmount(m.paid, m.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Money({
  v,
  c,
  tone,
  bold,
}: {
  v: number;
  c: string;
  tone?: "ok" | "due";
  bold?: boolean;
}) {
  const color =
    tone === "ok" ? "text-emerald-700" : tone === "due" ? "text-rose-700" : "text-slate-900";
  return (
    <td className={`px-4 py-2.5 text-right tabular-nums ${color} ${bold ? "font-semibold" : ""}`}>
      {formatAmount(v, c)}
    </td>
  );
}
