import { HttpErrorResponse } from '@angular/common/http';
import { speakingErrorMessage } from './speaking-messages';

// Stage 9: the teacher upload's refusals, in fixed words (the server's own text is never shown).
describe('speakingErrorMessage: teacher-uploaded recordings', () => {
  const error = (status: number, code: string) => new HttpErrorResponse({ status, error: { success: false, code, message: 'RAW SERVER TEXT' } });
  const cases: [number, string, RegExp][] = [
    [402, 'INSUFFICIENT_CREDITS', /no assessment credits left/],
    [409, 'TEACHER_UPLOAD_GUEST_EMAIL_UNAVAILABLE', /not available for speaking assignments yet/],
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
  it('each code has its own fixed text', () => {
    for (const [status, code, pattern] of cases) {
      const text = speakingErrorMessage(error(status, code));
      expect(text).withContext(code).toMatch(pattern);
      expect(text).not.toContain('RAW SERVER TEXT');
    }
  });
});
