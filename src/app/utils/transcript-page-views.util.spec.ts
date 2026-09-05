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

  it('classifies completed words or text as ready and empty processing/failed pages correctly', () => {
    const views = buildTranscriptPageViews({ submissionId: 's', fileIds: ['words', 'text', 'pending', 'failed'],
      overallOcrStatus: 'completed', corrections: [], ocrPages: [
        { fileId: 'words', pageNumber: 1, words: [{ id: 'w1', text: 'Word', bbox: null }] },
        { fileId: 'text', pageNumber: 1, text: 'Transcript text', words: [] },
        { fileId: 'pending', pageNumber: 1, status: 'processing', words: [] },
        { fileId: 'failed', pageNumber: 1, status: 'failed', words: [] }
      ] });
    expect(views.map((view) => view.status)).toEqual(['ready', 'ready', 'processing', 'failed']);
    const failed = buildTranscriptPageViews({ submissionId: 's', fileIds: ['failed'], overallOcrStatus: 'failed',
      corrections: [], ocrPages: [{ fileId: 'failed', pageNumber: 1, words: [] }] });
    expect(failed[0].status).toBe('failed');
  });

  it('returns cached-ready objects only when explicitly rebuilt by the caller', () => {
    const input = { submissionId: 's', fileIds: ['f1'], ocrPages: [page('f1', 'Only')], corrections: [] };
    const cached = buildTranscriptPageViews(input);
    expect(cached).toBe(cached);
    expect(cached).toHaveSize(1);
  });

  it('maps only Draft 2 correction anchors after a same-id replacement', () => {
    const views = buildTranscriptPageViews({ submissionId: 'same-submission', fileIds: ['draft-2-file'],
      ocrPages: [page('draft-2-file', 'New draft', 1, 'draft-2-word')], corrections: [
        { id: 'draft-1-correction', fileId: 'draft-1-file', page: 1, wordIds: ['draft-1-word'] },
        { id: 'draft-2-correction', fileId: 'draft-2-file', page: 1, wordIds: ['draft-2-word'],
          bboxList: [{ x: 10, y: 10, w: 20, h: 10 }] }
      ] });
    expect(views).toHaveSize(1);
    expect(views[0].annotations.map((item) => item._id)).toEqual(['draft-2-correction']);
    expect(views[0].annotations[0].wordIds).toEqual(['draft-2-word']);
  });

  it('never renders historical OCR pages outside the live current-file list', () => {
    const views = buildTranscriptPageViews({ submissionId: 'same-submission', fileIds: ['d2-1', 'd2-2'],
      ocrPages: [page('d1-1', 'Old one'), page('d1-2', 'Old two'),
        page('d2-1', 'New one'), page('d2-2', 'New two')], corrections: [] });
    expect(views.map((view) => view.key)).toEqual(['d2-1:1', 'd2-2:1']);
    expect(views.map((view) => view.displayNumber)).toEqual([1, 2]);
    expect(views.map((view) => view.text)).toEqual(['New one', 'New two']);
  });
});
