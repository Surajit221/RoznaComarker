export interface CropRect { x: number; y: number; width: number; height: number }
export interface AppliedCrop { file: File; rect: CropRect }

// Bound the export allocation on mobile; never silently resize handwriting.
export const CROP_MAX_PIXELS = 16 * 1024 * 1024;
export const CROP_MAX_EDGE = 8192;

export async function cropImage(image: HTMLImageElement, original: File, rect: CropRect): Promise<File> {
  const { naturalWidth: width, naturalHeight: height } = image;
  if (!width || !height || !Object.values(rect).every(Number.isFinite)
    || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0
    || rect.x + rect.width > 1.000001 || rect.y + rect.height > 1.000001) {
    throw new Error('Choose a valid crop inside the image.');
  }
  const x = Math.round(rect.x * width), y = Math.round(rect.y * height);
  const w = Math.min(width - x, Math.round(rect.width * width));
  const h = Math.min(height - y, Math.round(rect.height * height));
  if (Math.min(w, h) < 480 || Math.max(w, h) < 640) {
    throw new Error('Keep at least 640 by 480 pixels in either orientation and include all assignment content.');
  }
  if (w * h > CROP_MAX_PIXELS || Math.max(w, h) > CROP_MAX_EDGE) {
    throw new Error('This crop is too large to edit safely on this device. Choose a smaller crop that keeps all writing, or use the original image.');
  }
  const canvas = document.createElement('canvas');
  try {
    canvas.width = w; canvas.height = h;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image editing is unavailable. Try again or use the original image.');
    // The displayed image is already EXIF-oriented. PNG bakes that orientation
    // into pixels, without EXIF or another lossy JPEG generation.
    context.drawImage(image, x, y, w, h, 0, 0, w, h);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob || blob.type !== 'image/png' || !blob.size) throw new Error('Unable to create the crop. Please try again.');
    if (blob.size > 10 * 1024 * 1024) throw new Error('Only JPG, PNG, and PDF files up to 10MB are allowed. This crop is too large; use a smaller source image.');
    const stem = original.name.replace(/\.[^.]*$/, '').replace(/[^\w-]/g, '_').slice(0, 100) || 'essay';
    return new File([blob], `${stem}-cropped.png`, { type: 'image/png', lastModified: Date.now() });
  } finally { canvas.width = 0; canvas.height = 0; }
}
