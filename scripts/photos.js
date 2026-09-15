/**
 * Photo import. Turns whatever iOS hands the app — a camera capture, a Photos
 * library pick, or a file from Files (JPEG, HEIC, PNG) — into a JPEG for
 * storage and export, plus a small JPEG thumbnail for the photo grid.
 *
 * Re-encoding through a canvas bakes in the camera's rotation and drops
 * embedded metadata such as GPS location, which is what we want for patient
 * photos. Photos keep full iPad camera resolution (12 MP, 4032 px long edge);
 * anything larger (e.g. a 48 MP iPhone photo) is scaled down, which also keeps
 * the canvas under iOS's 16,777,216-pixel limit.
 */

const MAX_EDGE = 4032;
const MAX_PIXELS = 16_000_000;
const JPEG_QUALITY = 0.9;
const THUMB_EDGE = 480;
const THUMB_QUALITY = 0.8;

const UNREADABLE = "This file isn't a photo the iPad can read.";

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(UNREADABLE));
    img.src = url;
  });
}

function fitWithin(width, height, maxEdge, maxPixels = Infinity) {
  const scale = Math.min(1, maxEdge / Math.max(width, height), Math.sqrt(maxPixels / (width * height)));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function drawToCanvas(source, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  /* JPEG has no transparency: give transparent PNGs a white background, not black. */
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

/* iOS holds on to canvas memory until the backing store is shrunk. */
function releaseCanvas(canvas) {
  canvas.width = 0;
  canvas.height = 0;
}

function toJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the photo."))),
      "image/jpeg",
      quality,
    );
  });
}

/* Halve repeatedly before the final draw — one big downscale looks jagged. */
function makeThumbnailCanvas(full) {
  const target = fitWithin(full.width, full.height, THUMB_EDGE);
  let src = full;
  while (src.width / 2 >= target.width) {
    const half = drawToCanvas(src, Math.round(src.width / 2), Math.round(src.height / 2));
    if (src !== full) releaseCanvas(src);
    src = half;
  }
  const thumb = drawToCanvas(src, target.width, target.height);
  if (src !== full) releaseCanvas(src);
  return thumb;
}

/**
 * Resolves to { blob, thumb, width, height }; both Blobs are image/jpeg.
 * Rejects if the file can't be decoded as an image.
 */
export async function processPhotoFile(file) {
  const url = URL.createObjectURL(file);
  let full = null;
  let thumb = null;
  try {
    const img = await loadImage(url);
    if (!img.naturalWidth || !img.naturalHeight) throw new Error(UNREADABLE);
    const size = fitWithin(img.naturalWidth, img.naturalHeight, MAX_EDGE, MAX_PIXELS);
    full = drawToCanvas(img, size.width, size.height);
    const blob = await toJpeg(full, JPEG_QUALITY);
    thumb = makeThumbnailCanvas(full);
    const thumbBlob = await toJpeg(thumb, THUMB_QUALITY);
    return { blob, thumb: thumbBlob, width: size.width, height: size.height };
  } finally {
    URL.revokeObjectURL(url);
    if (full) releaseCanvas(full);
    if (thumb) releaseCanvas(thumb);
  }
}
