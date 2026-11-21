import { HttpErrorResponse } from '@angular/common/http';
import { SPEAKING_GENERIC_MESSAGE, speakingErrorMessage } from './speaking-messages';

// Fixed, friendly text for every backend refusal; the server's own text is never shown.
describe('speakingErrorMessage', () => {
  const error = (status: number, code?: string, message = 'RAW SERVER TEXT /home/app/uploads') =>
    new HttpErrorResponse({ status, error: code ? { success: false, code, message } : { message } });

  it('maps known codes to fixed messages and never returns the server text', () => {
    const cases: [number, string, RegExp][] = [
      [429, 'AUDIO_UPLOADS_UNAVAILABLE', /^Recording uploads are not available right now\. Please try again later or ask your teacher\.$/],
      [413, 'SPEAKING_STORAGE_FULL', /storage is full/],
      [422, 'AUDIO_UNREADABLE', /^We couldn't read the length of this recording\. Save it as MP3 or M4A and upload it again\.$/],
      [422, 'AUDIO_TOO_SHORT', /shorter than 5 seconds/],
      [400, 'AUDIO_TYPE_UNSUPPORTED', /MP3, M4A, WebM, Ogg or WAV/],
      [400, 'AUDIO_TYPE_MISMATCH', /does not match its type/],
      [400, 'AUDIO_HAS_VIDEO', /not a video/],
      [400, 'AUDIO_FILE_EMPTY', /empty/],
      [403, 'DEADLINE_PASSED', /due date has passed/],
      [403, 'NOT_CLASS_MEMBER', /not a member/],
      [403, 'SUBMISSION_LIMIT', /submission limit/],
      [409, 'SPEAKING_ALREADY_MARKED', /already marked/],
      [409, 'SPEAKING_UPLOAD_CONFLICT', /already being saved/],
      [409, 'TRANSCRIPTION_NOT_FAILED', /can't be retried now/],
      [409, 'ASSESSMENT_NOT_RETRYABLE', /can't be retried now/],
      [503, 'AUDIO_DURATION_UNAVAILABLE', /cannot be checked right now/],
      [404, 'NOT_FOUND', /isn't available/],
      [404, 'ASSIGNMENT_NOT_FOUND', /isn't available/],
      [400, 'SPEAKING_MAX_RECORDING_INVALID', /maximum recording length/i],
      [400, 'SPEAKING_RUBRIC_NOT_FOUND', /rubric/i]
    ];
    for (const [status, code, pattern] of cases) {
      const text = speakingErrorMessage(error(status, code));
      expect(text).withContext(code).toMatch(pattern);
      expect(text).not.toContain('RAW SERVER TEXT');
    }
  });

  it('the too-large message uses the limits it is given (40 MB, 7 minutes by default)', () => {
    expect(speakingErrorMessage(error(413, 'AUDIO_TOO_LARGE'))).toBe('This recording is too large (40 MB max) or longer than 7 minutes. Save it as MP3 or M4A, or record in mono, and upload it again.');
    expect(speakingErrorMessage(error(413, 'AUDIO_TOO_LONG'), { maxFileBytes: 20 * 1024 * 1024, maxRecordingSeconds: 180 }))
      .toBe('This recording is too large (20 MB max) or longer than 3 minutes. Save it as MP3 or M4A, or record in mono, and upload it again.');
  });

  it('a rate limit without a known code, an unknown code, a 500 and no network all get fixed text', () => {
    expect(speakingErrorMessage(error(429))).toMatch(/Too many requests/);
    expect(speakingErrorMessage(error(400, 'SOMETHING_NEW'))).toBe(SPEAKING_GENERIC_MESSAGE);
    expect(speakingErrorMessage(error(500, 'SPEAKING_FAILED'))).toBe(SPEAKING_GENERIC_MESSAGE);
    expect(speakingErrorMessage(new HttpErrorResponse({ status: 0 }))).toMatch(/connection/);
    expect(speakingErrorMessage(new Error('boom'))).toBe(SPEAKING_GENERIC_MESSAGE);
    expect(speakingErrorMessage(null)).toBe(SPEAKING_GENERIC_MESSAGE);
  });
});
