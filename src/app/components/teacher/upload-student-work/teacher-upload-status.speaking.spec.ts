import { uploadCanRetry, uploadIsStopped, uploadStatusDescription, uploadStatusLabel } from './teacher-upload-status';
import type { TeacherUploadItem } from '../../../api/teacher-upload-api.service';

const item = (over: Partial<TeacherUploadItem>): TeacherUploadItem => ({ submissionId: 's1', name: 'Ana', email: 'ana@example.com', account: 'member',
  uploadedByTeacher: true, pages: 1, status: 'uploaded', emailStatus: 'none', emailSentAt: null, emailFailedAt: null, uploadedAt: '2026-11-01T00:00:00Z', ...over });

describe('teacher upload status wording for recordings (stage 9); essays unchanged', () => {
  it('a recording reads "Transcribing" while it is turned into text; an essay still reads "Reading"', () => {
    expect(uploadStatusLabel(item({ kind: 'speaking', status: 'reading' }))).toBe('Transcribing');
    expect(uploadStatusLabel(item({ status: 'reading' }))).toBe('Reading');
    expect(uploadStatusDescription(item({ kind: 'speaking', status: 'processing' }))).toMatch(/recording/);
    expect(uploadStatusDescription(item({ status: 'processing' }))).toMatch(/handwriting/);
  });

  it('not marked (not enough speech, not English): its own label and reason; stopped; no retry', () => {
    const notMarked = item({ kind: 'speaking', status: 'not_marked', failureCode: 'SPEAKING_NOT_ENOUGH_SPEECH' });
    expect(uploadStatusLabel(notMarked)).toBe('Not marked');
    expect(uploadStatusDescription(notMarked)).toBe("There wasn't enough speech in the recording to mark it. Upload a new recording to have it marked.");
    expect(uploadStatusDescription({ ...notMarked, failureCode: 'SPEAKING_NOT_ENGLISH' })).toMatch(/mostly not in English/);
    expect(uploadIsStopped(notMarked)).toBeTrue();
    expect(uploadCanRetry(notMarked)).toBeFalse();
  });

  it('speech-to-text failures have their own reasons (a timeout there is not "the marking service")', () => {
    expect(uploadStatusDescription(item({ kind: 'speaking', status: 'failed', failureCode: 'AUDIO_STT_TIMEOUT' })))
      .toBe('The recording could not be turned into text. Press Retry marking to try again.');
    expect(uploadStatusDescription(item({ kind: 'speaking', status: 'failed', failureCode: 'AUDIO_MONTHLY_MINUTES_EXCEEDED' }))).toMatch(/minutes are used up/);
    expect(uploadStatusDescription(item({ status: 'failed', failureCode: 'OCR_TIMEOUT' }))).toMatch(/took too long/);
  });
});
