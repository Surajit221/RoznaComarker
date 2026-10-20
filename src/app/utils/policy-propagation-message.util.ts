export function policyPropagationMessage(result?: { status: string; staleCount?: number; restoredCount?: number }): string {
  if (result?.status === 'pending') return 'AI settings saved. Updating evaluation status is pending; some evaluations may need teacher re-evaluation, which uses Assessment Credits.';
  if (result?.staleCount) return `AI settings saved. ${result.staleCount} evaluation(s) need re-evaluation with the new settings. Re-evaluation uses Assessment Credits.`;
  if (result?.restoredCount) return `AI settings saved. ${result.restoredCount} existing evaluation(s) restored because the grading settings match again.`;
  return 'AI settings updated';
}
