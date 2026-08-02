import type { FeedbackAnnotation } from '../models/feedback-annotation.model';
import type { OcrBBox } from '../models/ocr-token.model';

export function normalizeCorrectionBox(value: unknown): OcrBBox | null {
  const box = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  if (!box) return null;
  const direct = [box['x'], box['y'], box['w'], box['h']].map(Number);
  const corners = [box['x0'], box['y0'], box['x1'], box['y1']].map(Number);
  const values = direct.every(Number.isFinite)
    ? direct : corners.every(Number.isFinite) ? [corners[0], corners[1], corners[2] - corners[0], corners[3] - corners[1]] : null;
  if (!values) return null;
  const [x, y, w, h] = values;
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x > 100 || y > 100 || x + w > 100 || y + h > 100) return null;
  return { x, y, w, h };
}

export function normalizeCorrectionBboxList(value: unknown): OcrBBox[] {
  return (Array.isArray(value) ? value : []).map(normalizeCorrectionBox)
    .filter((box): box is OcrBBox => box !== null);
}

export function annotationsForFileId(annotations: FeedbackAnnotation[], fileId: string,
  submissionFileIds: string[]): FeedbackAnnotation[] {
  const multiFile = submissionFileIds.filter(Boolean).length > 1;
  return annotations.filter((annotation) => annotation.fileId === fileId || (!multiFile && !annotation.fileId));
}
