// Client-only helpers for getting an iPhone photo ready to upload:
// convert HEIC/HEIF → JPEG, then downscale to a sane width.

const MAX_WIDTH = 2400;

function isHeic(file: File): boolean {
  return (
    /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
  );
}

async function toJpegIfHeic(file: File): Promise<Blob> {
  if (!isHeic(file)) return file;
  // heic2any is heavy — only load it when we actually hit a HEIC file.
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  });
  return Array.isArray(result) ? result[0] : result;
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

// Returns a JPEG Blob ready for upload, downscaled if wider than MAX_WIDTH.
// Always re-encodes non-JPEG sources (PNG screenshots etc.): uploads are
// stored and sent to the vision API as image/jpeg, and mismatched bytes make
// the API reject the whole analysis.
export async function prepareImage(file: File): Promise<Blob> {
  const jpeg = await toJpegIfHeic(file);
  const img = await loadImage(jpeg);

  const alreadyJpeg = /image\/jpe?g/i.test(jpeg.type);
  if (img.width <= MAX_WIDTH && alreadyJpeg) return jpeg;

  const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return jpeg;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ?? jpeg),
      "image/jpeg",
      0.9,
    );
  });
}
