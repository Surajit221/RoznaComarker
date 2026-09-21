import { HttpErrorResponse } from '@angular/common/http';

export function safeHttpErrorMessage(error: unknown, fallback = 'Please try again.'): string {
  if (!(error instanceof HttpErrorResponse)) return fallback;
  if (error.status === 0) return 'Unable to reach the server. Check your connection and try again.';
  if (error.status >= 500) return 'The service is temporarily unavailable. Please try again.';
  const backendMessage = error.error && typeof error.error.message === 'string'
    ? error.error.message.trim()
    : '';
  return backendMessage || fallback;
}
