import { buildTranscriptPageViews } from './transcript-page-views.util';

describe('complete transcript page views', () => {
  const page = (fileId: string, text: string, pageNumber = 1, wordId = 'word-1') => ({ fileId, pageNumber, text,
    status: 'completed', words: [{ id: wordId, text, separatorBefore: '', bbox: null }] });

  it('orders two and three images by upload order rather than id or OCR response order', () => {
    const two = buildTranscriptPageViews({ submissionId: 's', fileIds: ['z-file', 'a-file'],
      ocrPages: [page('a-file', 'Second'), page('z-file', 'First')], corrections: [] });
    expect(two.map((item) => item.text)).toEqual(['First', 'Second']);
    const three = buildTranscriptPageViews({ submissionId: 's', fileIds: ['f2', 'f1', 'f3'],
      ocrPages: [page('f3', 'Three'), page('f1', 'Two'), page('f2', 'One')], corrections: [] });
    expect(three.map((item) => item.key)).toEqual(['f2:1', 'f1:1', 'f3:1']);
    expect(new Set(three.map((item) => item.key)).size).toBe(3);
  });

  it('keeps duplicate word ids and corrections page-scoped', () => {
    const views = buildTranscriptPageViews({ submissionId: 's', fileIds: ['f1', 'f2'],
      ocrPages: [page('f1', 'First', 1, 'duplicate'), page('f2', 'Second', 1, 'duplicate')], corrections: [
        { id: 'c1', fileId: 'f1', page: 1, wordIds: ['duplicate'], message: 'First correction' },
        { id: 'c2', fileId: 'f2', page: 1, wordIds: ['duplicate'], message: 'Second correction' }
      ] });
    expect(views[0].annotations.map((item) => item._id)).toEqual(['c1']);
    expect(views[1].annotations.map((item) => item._id)).toEqual(['c2']);
    expect(views[0].words).not.toBe(views[1].words);
  });

  it('preserves ready pages when another uploaded page is pending or failed', () => {
    const pending = buildTranscriptPageViews({ submissionId: 's', fileIds: ['f1', 'f2'],
      ocrPages: [page('f1', 'Ready')], corrections: [], overallOcrStatus: 'processing' });
    expect(pending.map((item) => item.status)).toEqual(['ready', 'processing']);
    const failed = buildTranscriptPageViews({ submissionId: 's', fileIds: ['f1', 'f2'],
      ocrPages: [page('f1', 'Ready'), { fileId: 'f2', pageNumber: 1, status: 'failed', words: [] }], corrections: [] });
    expect(failed.map((item) => item.status)).toEqual(['ready', 'failed']);
  });

  it('returns cached-ready objects only when explicitly rebuilt by the caller', () => {
    const input = { submissionId: 's', fileIds: ['f1'], ocrPages: [page('f1', 'Only')], corrections: [] };
    const cached = buildTranscriptPageViews(input);
    expect(cached).toBe(cached);
    expect(cached).toHaveSize(1);
  });
});
