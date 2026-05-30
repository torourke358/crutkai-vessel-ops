// Generate the PWA icon set.
//
// Sources:
//   public/icon-source.png   — Thor's hammer (used for the home-screen icons)
//   public/vessel.png        — boat photo (used inside the app banners)
//
// If icon-source.png is missing, falls back to vessel.png so the script
// always produces a valid icon set.
//
// Run: npm run icons

import sharp from "sharp";
import { mkdirSync, existsSync } from "node:fs";

const PREFERRED = "public/icon-source.png";
const FALLBACK = "public/vessel.png";
const SRC = existsSync(PREFERRED) ? PREFERRED : FALLBACK;
const OUT = "public/icons";

if (SRC === FALLBACK) {
  console.warn(
    `! ${PREFERRED} not found — using ${FALLBACK} as a temporary source.`,
  );
  console.warn(
    `  Drop a square Thor's-hammer image at ${PREFERRED} and re-run.`,
  );
}

mkdirSync(OUT, { recursive: true });

const SIZES = [180, 192, 512];
for (const size of SIZES) {
  await sharp(SRC)
    .resize(size, size, { fit: "cover", position: "centre" })
    .png()
    .toFile(`${OUT}/icon-${size}.png`);
  console.log(`wrote ${OUT}/icon-${size}.png`);
}

// Maskable icon: shrink the source into the center ~80% safe zone, padded on
// a dark slate background (matches the manifest's theme_color) so Android
// can mask it to whatever shape.
const PAD = Math.round(512 * 0.1);
const inner = await sharp(SRC)
  .resize(512 - PAD * 2, 512 - PAD * 2, { fit: "cover", position: "centre" })
  .png()
  .toBuffer();

await sharp({
  create: {
    width: 512,
    height: 512,
    channels: 4,
    background: { r: 15, g: 23, b: 42, alpha: 1 }, // #0f172a
  },
})
  .composite([{ input: inner, left: PAD, top: PAD }])
  .png()
  .toFile(`${OUT}/icon-maskable-512.png`);
console.log(`wrote ${OUT}/icon-maskable-512.png`);

console.log("done.");
