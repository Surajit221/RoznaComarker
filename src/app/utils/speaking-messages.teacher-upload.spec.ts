import { HttpErrorResponse } from '@angular/common/http';
import { speakingErrorMessage } from './speaking-messages';

// Stage 9: the teacher upload's refusals, in fixed words (the server's own text is never shown).
describe('speakingErrorMessage: teacher-uploaded recordings', () => {
  const error = (status: number, code: string) => new HttpErrorResponse({ status, error: { success: false, code, message: 'RAW SERVER TEXT' } });
  const cases: [number, string, RegExp][] = [
    [402, 'INSUFFICIENT_CREDITS', /no assessment credits left/],
    [409, 'TEACHER_UPLOAD_EXISTS', /already uploaded/],
    [400, 'TEACHER_UPLOAD_MODE_INVALID', /one recording/],
    [409, 'STUDENT_ALREADY_SUBMITTED', /their own recording/],
    [409, 'TEACHER_UPLOAD_KEY_REUSED', /different recording/],
    [409, 'TEACHER_UPLOAD_DUPLICATE', /already saved/],
    [409, 'TEACHER_UPLOAD_CHANGED', /changed while saving/],
    [409, 'TEACHER_UPLOAD_BUSY', /still being saved/],
    [409, 'TEACHER_UPLOAD_MARKING_FAILED', /nothing to email/],
    [429, 'TEACHER_UPLOAD_RESEND_COOLDOWN', /Wait a minute/],
    [400, 'TEACHER_UPLOAD_NOT_SPEAKING', /speaking assignments/],
    [400, 'TEACHER_UPLOAD_STUDENT_INVALID', /name and email/],
    [409, 'TEACHER_UPLOAD_FILE_UNAVAILABLE', /no longer available/],
    [409, 'SPEAKING_UPLOADED_BY_TEACHER', /only your teacher can replace it/]
  ];
  // Stage 10b: guests on the guest speaking page.
  cases.push(
    [400, 'SPEAKING_CONSENT_REQUIRED', /tick the box to agree/],
    [403, 'INSUFFICIENT_ASSESSMENT_CREDITS', /can't receive recordings right now/],
    [403, 'TEACHER_STORAGE_FULL', /can't receive recordings right now/],
    [404, 'ASSIGNMENT_UNAVAILABLE', /isn't open for guest recordings/],
    [409, 'GUEST_REQUEST_KEY_REUSED', /Choose your recording again/],
    [409, 'GUEST_UPLOAD_IN_PROGRESS', /already being saved/],
    [403, 'GUEST_SUBMISSION_UNAVAILABLE', /temporarily unavailable/],
    [404, 'GUEST_LINK_INVALID', /Request a new link/]);
  it('each code has its own fixed text', () => {
    for (const [status, code, pattern] of cases) {
      const text = speakingErrorMessage(error(status, code));
      expect(text).withContext(code).toMatch(pattern);
      expect(text).not.toContain('RAW SERVER TEXT');
    }
  });
});
