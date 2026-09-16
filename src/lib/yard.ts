// Quadrant colours. Soft, well-differentiated pastels chosen for being easy to
// tell apart at a glance; a new quadrant takes the next one in rotation.
//
// The first four are the ones the database seeds on every new period
// (04_yard_enhancements.sql: Exterior / Interior / Engineering / Freeman) and
// must stay in that order — existing boards are already painted with them.
//
// The rest were added when Craig asked for buckets beyond the seeded four
// ("toys scuba, scooters"). With only four, a fifth bucket silently reused the
// first colour and its task titles fell back to unstyled slate.
export const QUADRANT_COLORS = [
  "#bae6fd", // sky-200     — cool blue
  "#bbf7d0", // green-200   — mint
  "#fed7aa", // orange-200  — peach
  "#ddd6fe", // violet-200  — lavender
  "#fecdd3", // rose-200    — blush
  "#fef08a", // yellow-200  — sand
  "#a5f3fc", // cyan-200    — lagoon
  "#e9d5ff", // purple-200  — orchid
  "#d9f99d", // lime-200    — deck green
  "#fed7e2", // pink-200    — coral
  "#c7d2fe", // indigo-200  — dusk
  "#99f6e4", // teal-200    — shallow water
] as const;

// Readable text for each pastel. The 200-level fills are far too light for
// body copy, so every colour above is paired with its 700-level counterpart;
// the board uses the pastel for the panel and this for the words on it.
export const QUADRANT_TEXT: Record<string, string> = {
  "#bae6fd": "#0369a1",
  "#bbf7d0": "#15803d",
  "#fed7aa": "#c2410c",
  "#ddd6fe": "#6d28d9",
  "#fecdd3": "#be123c",
  "#fef08a": "#a16207",
  "#a5f3fc": "#0e7490",
  "#e9d5ff": "#7e22ce",
  "#d9f99d": "#4d7c0f",
  "#fed7e2": "#be185d",
  "#c7d2fe": "#4338ca",
  "#99f6e4": "#0f766e",
};

export function nextQuadrantColor(existingCount: number): string {
  return QUADRANT_COLORS[existingCount % QUADRANT_COLORS.length];
}

/** Readable text colour for a quadrant fill, falling back to slate-700. */
export function quadrantTextColor(color: string): string {
  return QUADRANT_TEXT[color.toLowerCase()] ?? "#334155";
}
