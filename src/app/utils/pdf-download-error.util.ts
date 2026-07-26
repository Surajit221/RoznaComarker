export async function submissionPdfErrorMessage(error: any): Promise<string> {
  const status = Number(error?.status || 0);
  let backendMessage = '';
  const body = error?.error;
  if (body instanceof Blob) {
    try {
      const parsed = JSON.parse(await body.text());
      backendMessage = typeof parsed?.message === 'string' ? parsed.message.trim() : '';
    } catch {
      backendMessage = '';
    }
  } else if (body && typeof body.message === 'string') {
    backendMessage = body.message.trim();
  }
  if (status === 409) return backendMessage || 'The report data is still processing. Please try again shortly.';
  if (status === 413) return backendMessage || 'The submitted report images are too large to generate safely.';
  if (status === 503) return backendMessage || 'The PDF service is busy. Please try again shortly.';
  if (status === 504) return 'PDF generation timed out. Please try again in a moment.';
  return backendMessage || (status === 0
    ? 'The PDF service could not be reached. Please check your connection and try again.'
    : 'The PDF could not be generated. Please try again.');
}
