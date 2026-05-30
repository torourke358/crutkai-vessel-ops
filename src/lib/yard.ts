// Four soft, well-differentiated quadrant colors. Tailwind 200-level pastels
// chosen for being easy to tell apart at a glance. New quadrants get the
// next color in rotation based on how many already exist.
export const QUADRANT_COLORS = [
  "#bae6fd", // sky-200 — cool blue
  "#bbf7d0", // green-200 — mint
  "#fed7aa", // orange-200 — peach
  "#ddd6fe", // violet-200 — lavender
] as const;

export function nextQuadrantColor(existingCount: number): string {
  return QUADRANT_COLORS[existingCount % QUADRANT_COLORS.length];
}
