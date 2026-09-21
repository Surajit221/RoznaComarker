import { HttpErrorResponse } from '@angular/common/http';
import { safeHttpErrorMessage } from './safe-http-error-message.util';

describe('safeHttpErrorMessage', () => {
  it('maps status zero to a user-safe connectivity message', () => {
    const error = new HttpErrorResponse({ status: 0, statusText: 'Unknown Error', url: 'https://backend.example/api' });
    expect(safeHttpErrorMessage(error)).toBe('Unable to reach the server. Check your connection and try again.');
  });

  it('uses a safe backend business message when present', () => {
    const error = new HttpErrorResponse({ status: 403,
      error: { code: 'STUDENT_LIMIT_REACHED', message: 'Student limit reached for this account.' } });
    expect(safeHttpErrorMessage(error)).toBe('Student limit reached for this account.');
  });

  it('does not expose technical server error text', () => {
    const error = new HttpErrorResponse({ status: 502, error: { message: 'proxy upstream 10.0.0.2 failed' } });
    expect(safeHttpErrorMessage(error)).toBe('The service is temporarily unavailable. Please try again.');
  });
});
