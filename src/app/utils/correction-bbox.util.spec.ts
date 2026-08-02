import { annotationsForFileId, normalizeCorrectionBox, normalizeCorrectionBboxList } from './correction-bbox.util';
import type { FeedbackAnnotation } from '../models/feedback-annotation.model';

const annotation = (id: string, fileId?: string): FeedbackAnnotation => ({ _id: id, submissionId: 's', fileId,
  source: 'AI', editable: false, page: 1, bboxList: [{ x: 1, y: 2, w: 3, h: 4 }] });

describe('canonical correction bbox utilities', () => {
  it('converts corner boxes and preserves normalized boxes', () => {
    expect(normalizeCorrectionBox({ x0: 10, y0: 20, x1: 30, y1: 45 })).toEqual({ x: 10, y: 20, w: 20, h: 25 });
    expect(normalizeCorrectionBox({ x: 1, y: 2, w: 3, h: 4 })).toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });

  it('rejects invalid, non-finite, zero-area, negative, and out-of-range boxes', () => {
    expect(normalizeCorrectionBboxList([{ x0: 2, y0: 2, x1: 2, y1: 3 }, { x: -1, y: 1, w: 2, h: 2 },
      { x: 99, y: 1, w: 2, h: 2 }, { x: Number.NaN, y: 1, w: 2, h: 2 }])).toEqual([]);
  });

  it('scopes same-page corrections by file and permits missing fileId only for legacy single-file data', () => {
    const annotations = [annotation('a', 'file-a'), annotation('b', 'file-b'), annotation('legacy')];
    expect(annotationsForFileId(annotations, 'file-a', ['file-a', 'file-b']).map((item) => item._id)).toEqual(['a']);
    expect(annotationsForFileId(annotations, 'file-a', ['file-a']).map((item) => item._id)).toEqual(['a', 'legacy']);
  });
});
