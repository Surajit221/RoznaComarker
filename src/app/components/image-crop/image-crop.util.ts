export interface CropRect { x: number; y: number; width: number; height: number }
export interface AppliedCrop { file: File; rect: CropRect }

// Bound the export allocation on mobile; never silently resize handwriting.
export const CROP_MAX_PIXELS = 16 * 1024 * 1024;
export const CROP_MAX_EDGE = 8192;
// Decoded-image safety limit for the source region (matches the editor's own guard).
export const DECODE_MAX_PIXELS = 48 * 1024 * 1024;

// Upload limit enforced by the form and the backend.
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
// Aim below the hard limit so multipart overhead and re-encoding variance never tip a file over it.
export const JPEG_TARGET_BYTES = 8 * 1024 * 1024;
export const JPEG_START_QUALITY = 0.92;
// Handwriting strokes blur below this, so quality is never lowered past it.
export const JPEG_MIN_QUALITY = 0.85;
export const JPEG_QUALITY_STEP = 0.03;
// Resolution is reduced first. The long edge is never reduced below this (or below the source size, if smaller).
export const EXPORT_MIN_LONG_EDGE = 2000;
// Smallest allowed output in either orientation; mirrors the backend resolution check (640 x 480).
export const EXPORT_MIN_SHORT_EDGE = 480;
export const EXPORT_MIN_LONG_DIMENSION = 640;
export const EXPORT_SCALE_STEP = 0.85;

export interface ExportLimits {
  maxBytes: number; targetBytes: number; startQuality: number; minQuality: number;
  qualityStep: number; minLongEdge: number; scaleStep: number;
}
export const DEFAULT_EXPORT_LIMITS: Readonly<ExportLimits> = {
  maxBytes: UPLOAD_MAX_BYTES, targetBytes: JPEG_TARGET_BYTES, startQuality: JPEG_START_QUALITY,
  minQuality: JPEG_MIN_QUALITY, qualityStep: JPEG_QUALITY_STEP, minLongEdge: EXPORT_MIN_LONG_EDGE,
  scaleStep: EXPORT_SCALE_STEP,
};

interface SourceRegion { x: number; y: number; width: number; height: number }

export async function cropImage(image: HTMLImageElement, original: File, rect: CropRect,
  limits: Readonly<ExportLimits> = DEFAULT_EXPORT_LIMITS): Promise<File> {
  const { naturalWidth: width, naturalHeight: height } = image;
  if (!width || !height || !Object.values(rect).every(Number.isFinite)
    || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0
    || rect.x + rect.width > 1.000001 || rect.y + rect.height > 1.000001) {
    throw new Error('Choose a valid crop inside the image.');
  }
  const x = Math.round(rect.x * width), y = Math.round(rect.y * height);
  const w = Math.min(width - x, Math.round(rect.width * width));
  const h = Math.min(height - y, Math.round(rect.height * height));
  if (Math.min(w, h) < EXPORT_MIN_SHORT_EDGE || Math.max(w, h) < EXPORT_MIN_LONG_DIMENSION) {
    throw new Error('Keep at least 640 by 480 pixels in either orientation and include all assignment content.');
  }
  return encodeWithinLimit(image, { x, y, width: w, height: h }, original, '-cropped', limits);
}

// An uncropped photo over the upload limit goes through the same compressor as a crop.
// Files within the limit, and anything that is not an image (for example a PDF), are returned untouched.
export async function compressOversizedOriginal(original: File,
  limits: Readonly<ExportLimits> = DEFAULT_EXPORT_LIMITS): Promise<File> {
  const isImage = original.type.startsWith('image/') || /\.(jpe?g|png)$/i.test(original.name);
  if (!isImage || original.size <= limits.maxBytes) return original;
  const url = URL.createObjectURL(original);
  try {
    const image = new Image();
    image.src = url;
    try { await image.decode(); }
    catch { throw new Error('Unable to open this image. Choose another JPG or PNG.'); }
    return await encodeWithinLimit(image, { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight },
      original, '-compressed', limits);
  } finally { URL.revokeObjectURL(url); }
}

// Resolution is reduced first (never below the floor); quality is lowered only once the floor is reached,
// and never below the minimum quality.
async function encodeWithinLimit(image: HTMLImageElement, region: SourceRegion, original: File,
  suffix: string, limits: Readonly<ExportLimits>): Promise<File> {
  const { width: w, height: h } = region;
  if (!w || !h || w * h > DECODE_MAX_PIXELS) {
    throw new Error('This image is too large to process on this device. Choose a smaller photo.');
  }
  const longEdge = Math.max(w, h), shortEdge = Math.min(w, h);
  const startScale = Math.min(1, Math.sqrt(CROP_MAX_PIXELS / (w * h)), CROP_MAX_EDGE / longEdge);
  const floorScale = Math.min(startScale, Math.max(limits.minLongEdge / longEdge, EXPORT_MIN_SHORT_EDGE / shortEdge));

  let scale = startScale;
  let blob = await encodeJpeg(image, region, scale, limits.startQuality);
  while (blob.size > limits.targetBytes && scale > floorScale) {
    // Jump close to the target using the size/area relationship, but always make progress.
    const predicted = scale * Math.sqrt(limits.targetBytes / blob.size) * 0.95;
    scale = Math.max(floorScale, Math.min(scale * limits.scaleStep, predicted));
    blob = await encodeJpeg(image, region, scale, limits.startQuality);
  }
  if (blob.size > limits.targetBytes) {
    for (const quality of lowerQualities(limits)) {
      blob = await encodeJpeg(image, region, scale, quality);
      if (blob.size <= limits.targetBytes) break;
    }
  }
  if (blob.size > limits.maxBytes) {
    throw new Error('This image is still too large after compression. Crop closer to the writing or choose a smaller photo.');
  }
  const stem = original.name.replace(/\.[^.]*$/, '').replace(/[^\w-]/g, '_').slice(0, 100) || 'essay';
  return new File([blob], `${stem}${suffix}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

function lowerQualities(limits: Readonly<ExportLimits>): number[] {
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const qualities: number[] = [];
  for (let q = round(limits.startQuality - limits.qualityStep); q > limits.minQuality; q = round(q - limits.qualityStep)) {
    qualities.push(q);
  }
  qualities.push(limits.minQuality);
  return qualities;
}

async function encodeJpeg(image: HTMLImageElement, region: SourceRegion, scale: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  try {
    canvas.width = Math.max(1, Math.round(region.width * scale));
    canvas.height = Math.max(1, Math.round(region.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image editing is unavailable. Try again or use the original image.');
    // JPEG has no alpha channel; transparent PNG pixels would otherwise turn black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    // The displayed image is already EXIF-oriented, so the orientation is baked into
    // the pixels and the JPEG carries no EXIF.
    context.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.type !== 'image/jpeg' || !blob.size) throw new Error('Unable to create the crop. Please try again.');
    return blob;
  } finally { canvas.width = 0; canvas.height = 0; }
}
