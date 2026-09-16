import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { YardPeriod } from "@/lib/types";
import type { CurrencyBlock } from "@/lib/yard-money";

// Header, money strip and tabs — the frame every yard period screen sits in.
//
// The money strip stays visible on all four tabs on purpose: what a refit has
// cost and what is still owed is the thing Craig opens the app to find out,
// and it shouldn't be hidden behind a tab he has to remember to press.

const STATUS_BADGE: Record<string, string> = {
  planned: "bg-slate-100 text-slate-700",
  active: "bg-emerald-100 text-emerald-800",
  closed: "bg-amber-100 text-amber-800",
};

export type YardTab = "board" | "estimates" | "money" | "timeline";

const TABS: { key: YardTab; label: string; href: (id: string) => string; adminOnly: boolean }[] = [
  { key: "board", label: "Board", href: (id) => `/yard/${id}`, adminOnly: false },
  { key: "estimates", label: "Estimates", href: (id) => `/yard/${id}/estimates`, adminOnly: true },
  { key: "money", label: "Money", href: (id) => `/yard/${id}/money`, adminOnly: true },
  { key: "timeline", label: "Timeline", href: (id) => `/yard/${id}/timeline`, adminOnly: false },
];

/** Whole dollars on the strip — the cents belong on the Money tab, not here. */
function short(n: number, currency: string): string {
  const v = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(n));
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "";
  return symbol ? `${symbol}${v}` : `${v} ${currency}`;
}

export default function YardPeriodHeader({
  period,
  active,
  isAdmin,
  money,
  clashCount = 0,
}: {
  period: YardPeriod;
  active: YardTab;
  isAdmin: boolean;
  /** The dominant currency block, or null when no estimate has been captured. */
  money: CurrencyBlock | null;
  clashCount?: number;
}) {
  const tabs = TABS.filter((t) => isAdmin || !t.adminOnly);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{period.name}</h1>
          <p className="text-sm text-slate-500">
            {formatDate(period.start_date)}
            {period.end_date && <span> → {formatDate(period.end_date)}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              STATUS_BADGE[period.status] ?? "bg-slate-100 text-slate-700"
            }`}
          >
            {period.status}
          </span>
          <Link href="/yard" className="font-medium text-slate-500 hover:text-violet-700">
            All periods
          </Link>
          {isAdmin && (
            <Link
              href={`/yard/${period.id}/manage`}
              className="font-medium text-slate-500 hover:text-violet-700"
            >
              Edit
            </Link>
          )}
        </div>
      </div>

      {money && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-slate-200 ring-1 ring-slate-200 sm:grid-cols-3 lg:grid-cols-5">
          <Figure label="Committed" value={short(money.committed, money.currency)} />
          <Figure label="Billed" value={short(money.billed, money.currency)} />
          <Figure label="Paid" value={short(money.paid, money.currency)} tone="ok" />
          <Figure
            label="Outstanding"
            value={short(money.outstanding, money.currency)}
            tone={money.outstanding > 0 ? "due" : undefined}
          />
          <Figure label="Still to come" value={short(money.still_to_come, money.currency)} />
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href(period.id)}
              aria-current={on ? "page" : undefined}
              className={`-mb-px whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium ${
                on
                  ? "border-violet-600 text-violet-700"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              {t.label}
              {t.key === "timeline" && clashCount > 0 && (
                <span className="ml-1.5 inline-block rounded-full bg-rose-600 px-1.5 text-[10px] font-semibold leading-[15px] text-white">
                  {clashCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "due";
}) {
  const color =
    tone === "ok" ? "text-emerald-700" : tone === "due" ? "text-rose-700" : "text-slate-900";
  return (
    <div className="bg-white px-3 py-2.5">
      <p className="truncate text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 text-base font-medium tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
