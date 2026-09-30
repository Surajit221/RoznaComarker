import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import type { OcrBBox, OcrWord } from '../../models/ocr-token.model';

export interface AnnotationSegment {
  id: string;
  left: number;
  top: number;
  width: number;
  color: string;
  anchorTop: number;
}

export interface AnnotationVisual {
  annotation: FeedbackAnnotation;
  segments: AnnotationSegment[];
}

interface LocatedBox { box: OcrBBox; order: number; newLine: boolean; }

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function validBox(box: OcrBBox | null | undefined): box is OcrBBox {
  return !!box && [box.x, box.y, box.w, box.h].every(Number.isFinite)
    && box.x >= 0 && box.y >= 0 && box.w > 0 && box.h > 0
    && box.x + box.w <= 100.5 && box.y + box.h <= 100.5;
}

function sameLine(a: OcrBBox, b: OcrBBox, imageHeight: number): boolean {
  const overlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const centerGapPx = Math.abs(a.y + a.h / 2 - b.y - b.h / 2) * imageHeight / 100;
  const shorterPx = Math.min(a.h, b.h) * imageHeight / 100;
  return overlap > Math.min(a.h, b.h) * 0.25 || centerGapPx <= shorterPx * 0.55;
}

function connected(a: LocatedBox, b: LocatedBox, imageWidth: number, imageHeight: number,
  hasWordOrder: boolean): boolean {
  if (b.newLine || !sameLine(a.box, b.box, imageHeight)) return false;
  if (hasWordOrder && b.order !== a.order + 1) return false;
  const gapPx = Math.max(0, b.box.x - a.box.x - a.box.w) * imageWidth / 100;
  const heightPx = Math.max(a.box.h, b.box.h) * imageHeight / 100;
  return gapPx <= Math.max(8, heightPx * 1.8);
}

function segment(id: string, boxes: LocatedBox[], color: string, imageWidth: number,
  imageHeight: number): AnnotationSegment {
  const left = Math.min(...boxes.map((item) => item.box.x));
  const right = Math.max(...boxes.map((item) => item.box.x + item.box.w));
  const bottom = Math.max(...boxes.map((item) => item.box.y + item.box.h));
  const height = Math.max(...boxes.map((item) => item.box.h));
  const padX = Math.min(1.5 / imageWidth * 100, height * imageHeight / imageWidth * 0.08);
  const x1 = clamp(left - padX, 0, 100);
  const x2 = clamp(Math.max(right + padX, x1 + 2 / imageWidth * 100), 0, 100);
  const top = clamp(bottom + Math.max(1.5 / imageHeight * 100, height * 0.12), 0, 99.8);
  const last = boxes[boxes.length - 1].box;
  return { id, left: x1, top, width: x2 - x1, color,
    anchorTop: clamp(last.y + last.h * 0.15, 0, 100) };
}

/** OCR coordinates and returned geometry are percentages of the same image content rectangle. */
export function buildAnnotationVisuals(annotations: FeedbackAnnotation[], words: OcrWord[], page: number,
  imageWidth: number, imageHeight: number): AnnotationVisual[] {
  if (imageWidth <= 0 || imageHeight <= 0) return [];
  const wordIndex = new Map<string, { word: OcrWord; order: number }>();
  words.forEach((word, order) => { if (word.id) wordIndex.set(word.id, { word, order }); });
  const visuals: AnnotationVisual[] = [];
  for (const annotation of annotations) {
    if (!annotation || (annotation.page && Number(annotation.page) !== Number(page))) continue;
    const mapped = (annotation.wordIds || []).map((id) => wordIndex.get(String(id)))
      .filter((item): item is { word: OcrWord; order: number } => !!item && validBox(item.word.bbox))
      .map((item) => ({ box: item.word.bbox!, order: item.order,
        newLine: item.word.separatorBefore === '\n' || item.word.separatorBefore === '\n\n' }));
    const hasWordOrder = mapped.length > 0;
    const located: LocatedBox[] = hasWordOrder ? mapped : (annotation.bboxList || [])
      .filter(validBox).map((box, order) => ({ box, order, newLine: false }));
    if (!located.length) continue;
    const groups: LocatedBox[][] = [];
    for (const item of located) {
      const current = groups[groups.length - 1];
      if (!current || !connected(current[current.length - 1], item, imageWidth, imageHeight, hasWordOrder)) {
        groups.push([item]);
      } else current.push(item);
    }
    const color = annotation.color || '#d64545';
    visuals.push({ annotation, segments: groups.map((group, index) =>
      segment(`${annotation._id}_${index}`, group, color, imageWidth, imageHeight)) });
  }
  return visuals;
}
