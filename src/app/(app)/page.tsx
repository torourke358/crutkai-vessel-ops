import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// Home dashboard placeholder. Will fill in with module tiles in Build Step 10
// (Inventory Critical / No Stock, Maintenance Due Today / Overdue, Active Yard
// counts). For now it's a friendly "what's here" landing.
export const dynamic = "force-dynamic";

const tiles = [
  {
    href: "/inventory",
    title: "Inventory",
    blurb: "Parts on hand, locations, critical thresholds.",
  },
  {
    href: "/equipment",
    title: "Equipment",
    blurb: "Gearboxes, gensets, AC, electronics — and their hours.",
  },
  {
    href: "/maintenance",
    title: "Maintenance",
    blurb: "Calendar + hours-based tasks. Sign-offs, history, alerts.",
  },
  {
    href: "/yard",
    title: "Yard periods",
    blurb: "Plan, track, and cost the 5-year cycle by quadrant.",
  },
];

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Welcome aboard.
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Signed in as <span className="font-medium">{user?.email}</span>.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {tiles.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-2xl bg-white p-5 ring-1 ring-slate-100 transition-shadow hover:shadow-sm"
          >
            <p className="text-base font-semibold text-slate-900">{t.title}</p>
            <p className="mt-1 text-sm text-slate-500">{t.blurb}</p>
          </Link>
        ))}
      </div>

      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Module pages are being built. Links above will 404 until each
        module ships. Track progress in the implementation plan.
      </p>
    </div>
  );
}
