import { submissionPdfErrorMessage } from './pdf-download-error.util';

describe('submissionPdfErrorMessage', () => {
  it('does not display a misleading proxy 504 status string', async () => {
    expect(await submissionPdfErrorMessage({ status: 504, statusText: 'OK', error: new Blob([]) }))
      .toBe('PDF generation timed out. Please try again in a moment.');
  });

  it('extracts a controlled backend message from a blob response', async () => {
    const error = { status: 413, error: new Blob([JSON.stringify({ message: 'Safe asset limit exceeded.' })], { type: 'application/json' }) };
    expect(await submissionPdfErrorMessage(error)).toBe('Safe asset limit exceeded.');
  });
});
