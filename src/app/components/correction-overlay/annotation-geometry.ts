import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import type { OcrBBox, OcrWord } from '../../models/ocr-token.model';
import { classifyCorrectionVisualType } from './annotation-classification';

export interface AnnotationSegment {
  id: string;
  left: number;
  top: number;
  width: number;
  color: string;
  anchorTop: number;
  height?: number;
  correctionIds: string[];
  lineKey?: string;
  boundary?: boolean;
  /** Lowest permitted stroke edge in image-percent coordinates. */
  underlineBottom?: number;
}

export interface AnnotationVisual {
  annotation: FeedbackAnnotation;
  segments: AnnotationSegment[];
  semantic: boolean;
  lineKeys: string[];
}

interface LocatedBox { box: OcrBBox; order: number; newLine: boolean; line: number; }

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
  return overlap > Math.min(a.h, b.h) * 0.35 && centerGapPx <= shorterPx * 0.55;
}

function connected(a: LocatedBox, b: LocatedBox, imageWidth: number, imageHeight: number,
  hasWordOrder: boolean): boolean {
  if (a.line !== b.line) return false;
  if (b.newLine || !sameLine(a.box, b.box, imageHeight)) return false;
  if (hasWordOrder && b.order !== a.order + 1) return false;
  const gapPx = Math.max(0, b.box.x - a.box.x - a.box.w) * imageWidth / 100;
  const heightPx = Math.min(a.box.h, b.box.h) * imageHeight / 100;
  return gapPx <= Math.max(imageWidth * 0.003, heightPx * 0.85);
}

function legacyBoxes(boxes: OcrBBox[], imageHeight: number): LocatedBox[] {
  const sorted = boxes.filter(validBox).slice().sort((a, b) => a.y - b.y || a.x - b.x);
  let line = 0;
  let previous: OcrBBox | undefined;
  const located = sorted.map((box, order) => {
    if (previous && !sameLine(previous, box, imageHeight)) line++;
    previous = box;
    return { box, order, line, newLine: false };
  });
  return located.sort((a, b) => a.line - b.line || a.box.x - b.box.x);
}

function segment(id: string, boxes: LocatedBox[], color: string, imageWidth: number,
  imageHeight: number, nextLineTop = 100): AnnotationSegment {
  const left = Math.min(...boxes.map((item) => item.box.x));
  const right = Math.max(...boxes.map((item) => item.box.x + item.box.w));
  const bottom = Math.max(...boxes.map((item) => item.box.y + item.box.h));
  const height = Math.max(...boxes.map((item) => item.box.h));
  const padX = Math.min(1.5 / imageWidth * 100, height * imageHeight / imageWidth * 0.08);
  const x1 = clamp(left - padX, 0, 100);
  const x2 = clamp(Math.max(right + padX, x1 + 2 / imageWidth * 100), 0, 100);
  const heights = boxes.map(item => item.box.h).sort((a, b) => a - b);
  const middle = Math.floor(heights.length / 2);
  const medianHeight = heights.length % 2 ? heights[middle] : (heights[middle - 1] + heights[middle]) / 2;
  const clearance = computeUnderlineClearance(bottom, medianHeight, nextLineTop);
  return { id, left: x1, ...clearance, width: x2 - x1, color,
    correctionIds: [], anchorTop: clamp(Math.min(...boxes.map((item) => item.box.y)), 0, 100) };
}

/** Render-only percentages: reserve room for the entire stroke, including selection. */
export function computeUnderlineClearance(targetBottom: number, wordHeight: number,
  nextLineTop = 100): { top: number; underlineBottom: number } {
  const space = Math.max(0, nextLineTop - targetBottom);
  const padding = Math.min(wordHeight * 0.04, space * 0.2);
  const strokeRoom = Math.min(wordHeight * 0.08, (space - padding) * 0.4);
  const gap = Math.min(wordHeight * 0.06, 0.18, Math.max(0, space - padding - strokeRoom));
  const top = targetBottom + gap;
  // Touching/overlapping source boxes offer no exterior clearance. Keep the
  // original target edge and a minimal stroke rather than hide or remap it.
  return { top, underlineBottom: space > 0 ? nextLineTop - padding : top + wordHeight * 0.01 };
}

/** OCR coordinates and returned geometry are percentages of the same image content rectangle. */
export function buildAnnotationVisuals(annotations: FeedbackAnnotation[], words: OcrWord[], page: number,
  imageWidth: number, imageHeight: number): AnnotationVisual[] {
  if (imageWidth <= 0 || imageHeight <= 0) return [];
  const wordIndex = new Map<string, { word: OcrWord; order: number; line: number }>();
  let line = 0;
  let previous: OcrWord | undefined;
  words.forEach((word, order) => {
    if (previous && (word.separatorBefore?.includes('\n') || (validBox(previous.bbox)
      && validBox(word.bbox) && (!sameLine(previous.bbox, word.bbox, imageHeight)
        || word.bbox.x < previous.bbox.x - previous.bbox.w * 0.5)))) line++;
    if (word.id) wordIndex.set(word.id, { word, order, line });
    previous = word;
  });
  const pageBoxes = words.map((word) => word.bbox).filter(validBox);
  const pageLines = new Map<number, OcrBBox[]>();
  for (const item of wordIndex.values()) {
    if (!validBox(item.word.bbox)) continue;
    const row = pageLines.get(item.line) || [];
    row.push(item.word.bbox); pageLines.set(item.line, row);
  }
  const textLeft = pageBoxes.length ? Math.min(...pageBoxes.map((box) => box.x)) : 0;
  const textRight = pageBoxes.length ? Math.max(...pageBoxes.map((box) => box.x + box.w)) : 100;
  const visuals: AnnotationVisual[] = [];
  for (const annotation of annotations) {
    if (!annotation || (annotation.page && Number(annotation.page) !== Number(page))) continue;
    const resolved = annotation.renderTarget?.version === 1 ? annotation.renderTarget : undefined;
    const target = annotation.visualTarget;
    const targetIds = resolved ? resolved : target?.version === 1 && Array.isArray(target.wordIds) && Array.isArray(target.anchors)
      && target.wordIds.length + target.anchors.length > 0 && target.wordIds.length + target.anchors.length <= 128
      && classifyCorrectionVisualType(annotation) !== 'semantic'
      && target.wordIds.every((id) => validBox(wordIndex.get(id)?.word.bbox))
      && target.anchors.every((a) => a && validBox(wordIndex.get(a.wordId)?.word.bbox)
        && ['before', 'after'].includes(a.side)) ? target : undefined;
    const mapped = [...new Set(targetIds ? targetIds.wordIds : annotation.wordIds || [])].map((id) => wordIndex.get(String(id)))
      .filter((item): item is { word: OcrWord; order: number; line: number } => !!item && validBox(item.word.bbox))
      .sort((a, b) => a.line - b.line || a.word.bbox!.x - b.word.bbox!.x)
      .map((item) => ({ box: item.word.bbox!, order: item.order,
        line: item.line, newLine: item.word.separatorBefore === '\n' || item.word.separatorBefore === '\n\n' }));
    const hasWordOrder = mapped.length > 0;
    const located: LocatedBox[] = hasWordOrder ? mapped : resolved
      ? legacyBoxes(resolved.boxes, imageHeight) : targetIds ? [] : legacyBoxes(annotation.bboxList || [], imageHeight);
    const boundaries: AnnotationSegment[] = (targetIds?.anchors || []).flatMap((a, i) => {
      const item = wordIndex.get(a.wordId); const box = item?.word.bbox;
      if (!item || !validBox(box)) return [];
      const edge = a.side === 'after' ? box.x + box.w : box.x;
      return [{ id: `${annotation._id}_boundary_${i}`, left: clamp(edge - 2 / imageWidth * 100, 0, 99),
        top: clamp(box.y + box.h, 0, 99), width: 4 / imageWidth * 100, boundary: true,
        color: annotation.color || '#d64545', anchorTop: box.y, lineKey: `word:${item.line}`, correctionIds: [annotation._id] }];
    });
    if (!located.length && !boundaries.length) continue;
    const semantic = classifyCorrectionVisualType(annotation) === 'semantic';
    const lineKey = (item: LocatedBox): string => hasWordOrder ? `word:${item.line}` : `box:${Math.round(item.box.y)}`;
    const lineKeys = [...new Set([...located.map(lineKey), ...boundaries.map((b) => b.lineKey!)])];
    if (semantic) {
      const leftFree = textLeft;
      const rightFree = 100 - textRight;
      const railX = leftFree >= 6 ? clamp(textLeft - 1.5, 1, 99)
        : rightFree >= 6 ? clamp(textRight + 1.5, 1, 99)
          : leftFree >= rightFree ? 1 : 99;
      // One rail per affected visual line; never bridge an unrelated intervening line.
      const lines = new Map<number, LocatedBox[]>();
      for (const item of located) {
        const row = lines.get(item.line) || [];
        row.push(item); lines.set(item.line, row);
      }
      visuals.push({ annotation, semantic: true, lineKeys, segments: [...lines.values()].map((row, index) => {
        const top = clamp(Math.min(...row.map((item) => item.box.y)) - 0.2, 0, 100);
        const bottom = clamp(Math.max(...row.map((item) => item.box.y + item.box.h)) + 0.2, 0, 100);
        return { id: `${annotation._id}_semantic_${index}`, left: railX, top, width: 0,
          height: bottom - top, color: annotation.color || '#d64545', anchorTop: top,
          correctionIds: [annotation._id] };
      }) });
      continue;
    }
    const groups: LocatedBox[][] = [];
    for (const item of located) {
      const current = groups[groups.length - 1];
      if (!current || !connected(current[current.length - 1], item, imageWidth, imageHeight, hasWordOrder)) {
        groups.push([item]);
      } else current.push(item);
    }
    const color = annotation.color || '#d64545';
    const lineBoxes = hasWordOrder ? pageLines : new Map<number, OcrBBox[]>();
    if (!hasWordOrder) for (const item of located) {
      const row = lineBoxes.get(item.line) || [];
      row.push(item.box); lineBoxes.set(item.line, row);
    }
    visuals.push({ annotation, semantic: false, lineKeys, segments: [...groups.map((group, index) =>
      ({ ...segment(`${annotation._id}_${index}`, group, color, imageWidth, imageHeight,
        Math.min(100, ...[...lineBoxes].filter(([row]) => row > group[0].line)
          .flatMap(([, row]) => row.map(box => box.y)))),
        lineKey: lineKey(group[0]), correctionIds: [annotation._id] })), ...boundaries] });
  }
  return visuals;
}
