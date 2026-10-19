import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import type { OcrBBox, OcrWord } from '../../models/ocr-token.model';

export interface AnnotationImageGeometry {
  version: 1;
  fileId: string;
  pageNumber: number;
  width: number;
  height: number;
  orientation: 1 | 3 | 6 | 8;
  coordinateSpace: 'encoded-image' | 'display-image';
  ambiguous?: boolean;
}

export function sourceGeometryMatchesImage(geometry: AnnotationImageGeometry | null, fileId: string | null,
  page: number, width: number, height: number): boolean {
  if (!geometry) return true;
  if (geometry.ambiguous || geometry.fileId !== fileId || geometry.pageNumber !== page) return false;
  const swap = geometry.coordinateSpace === 'encoded-image' && [6, 8].includes(geometry.orientation);
  const expectedWidth = swap ? geometry.height : geometry.width;
  const expectedHeight = swap ? geometry.width : geometry.height;
  return Math.abs(width - expectedWidth) <= 1 && Math.abs(height - expectedHeight) <= 1;
}

/** EXIF maps encoded pixel axes to browser-oriented image content, in percent. */
export function orientedBox(box: OcrBBox, orientation: 1 | 3 | 6 | 8): OcrBBox {
  if (orientation === 3) return { x: 100 - box.x - box.w, y: 100 - box.y - box.h, w: box.w, h: box.h };
  if (orientation === 6) return { x: 100 - box.y - box.h, y: box.x, w: box.h, h: box.w };
  if (orientation === 8) return { x: box.y, y: 100 - box.x - box.w, w: box.h, h: box.w };
  return box;
}

/** Only presentation copies change; all canonical inputs and target identities stay intact. */
export function imagePresentationGeometry(annotations: FeedbackAnnotation[], words: OcrWord[],
  geometry: AnnotationImageGeometry | null, fileId: string | null, page: number,
  naturalWidth?: number, naturalHeight?: number): {
    annotations: FeedbackAnnotation[]; words: OcrWord[];
  } {
  if (!geometry || geometry.ambiguous || geometry.version !== 1 || geometry.coordinateSpace !== 'encoded-image'
    || (naturalWidth !== undefined && naturalHeight !== undefined && !sourceGeometryMatchesImage(geometry, fileId, page, naturalWidth, naturalHeight))
    || ![3, 6, 8].includes(geometry.orientation) || !fileId || geometry.fileId !== fileId
    || geometry.pageNumber !== page || !(geometry.width > 0 && geometry.height > 0)) return { annotations, words };
  const project = (box: OcrBBox): OcrBBox => orientedBox(box, geometry.orientation);
  const projectedWords = words.map(word => ({ ...word, bbox: word.bbox ? project(word.bbox) : word.bbox }));
  const byId = new Map(projectedWords.map(word => [word.id, word.bbox]));
  return {
    words: projectedWords,
    annotations: annotations.map(annotation => ({ ...annotation,
      // Legacy boxes may belong to an older OCR. Only project those with explicit
      // matching provenance; word-based targets are rebuilt from projected words.
      bboxList: annotation.bboxCoordinateSpace === geometry.coordinateSpace ? annotation.bboxList?.map(project) : [],
      renderTarget: annotation.renderTarget ? { ...annotation.renderTarget,
        boxes: annotation.renderTarget.wordIds.length
          ? annotation.renderTarget.wordIds.flatMap(id => byId.get(id) ? [byId.get(id)!] : [])
          : annotation.renderTarget.coordinateSpace === geometry.coordinateSpace ? annotation.renderTarget.boxes.map(project) : [],
        ...(annotation.renderTarget.source === 'bboxList' && annotation.renderTarget.coordinateSpace !== geometry.coordinateSpace
          ? { source: 'none' as const } : {}) } : undefined }))
  };
}
