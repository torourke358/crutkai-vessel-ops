import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface PinnedRow {
  id: string;
  name: string;
  ga_x: number | null;
  ga_y: number | null;
  critical: boolean;
}

// Equipment GA viewer. Renders the schematic with a dot per pinned unit.
// Tap a dot → its equipment detail page. Unpinned items listed below so
// they're easy to grab and pin from the edit form.
export default async function EquipmentGaPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("equipment")
    .select("id, name, ga_x, ga_y, critical")
    .eq("active", true)
    .order("name", { ascending: true })
    .returns<PinnedRow[]>();

  const pinned = (rows ?? []).filter((r) => r.ga_x != null && r.ga_y != null);
  const unpinned = (rows ?? []).filter((r) => r.ga_x == null || r.ga_y == null);

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">GA · Equipment</h1>
        <Link href="/equipment" className="text-sm text-slate-500">
          Back to list
        </Link>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100"
        style={{ aspectRatio: "1000 / 520" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/ga-schematic.svg"
          alt="GA schematic"
          className="block h-full w-full select-none"
          draggable={false}
        />
        {pinned.map((r) => (
          <Link
            key={r.id}
            href={`/equipment/${r.id}`}
            className="group absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${r.ga_x}%`, top: `${r.ga_y}%` }}
            aria-label={r.name}
          >
            <span
              className={`block h-3 w-3 rounded-full ring-2 ring-white shadow ${
                r.critical ? "bg-rose-600" : "bg-violet-600"
              }`}
            />
            <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
              {r.name}
            </span>
          </Link>
        ))}
      </div>

      <p className="text-xs text-slate-400">
        {pinned.length} pinned · {unpinned.length} unpinned ·{" "}
        <span className="text-rose-700">Critical</span> /{" "}
        <span className="text-violet-700">Non-critical</span>
      </p>

      {unpinned.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">
            Not yet pinned ({unpinned.length})
          </h2>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
            {unpinned.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/equipment/${r.id}`}
                  className="block p-3 text-sm text-slate-700 hover:bg-slate-50 hover:text-violet-700"
                >
                  {r.name}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-400">
            Open a unit and use the &quot;Pin on GA&quot; widget at the bottom
            of its edit form to place it on the schematic.
          </p>
        </section>
      )}
    </div>
  );
}
