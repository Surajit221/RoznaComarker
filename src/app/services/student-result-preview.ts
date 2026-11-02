import { InjectionToken } from '@angular/core';

/**
 * Present only when the student result page is rendered as a teacher's preview. The page then shows the supplied (saved, server-built)
 * student payload, and leaves out everything that would act as the student or call an endpoint with the teacher's rights.
 */
export interface StudentResultPreview {
  /** The same response the student's ocr-corrections request gets. Rejects with { status } when that request would have failed. */
  ocrResponse(): Promise<unknown>;
}
export const STUDENT_RESULT_PREVIEW = new InjectionToken<StudentResultPreview>('STUDENT_RESULT_PREVIEW');
