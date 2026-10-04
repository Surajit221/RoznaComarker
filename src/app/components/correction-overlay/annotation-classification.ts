import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import { DEFAULT_CORRECTION_LEGEND } from '../../constants/correction-legend.default';

export type CorrectionVisualType = 'local' | 'semantic';
const types = new Map<string, CorrectionVisualType>();
for (const group of DEFAULT_CORRECTION_LEGEND.groups) {
  for (const entry of group.symbols) {
    types.set(entry.symbol, ['CONTENT', 'ORGANIZATION'].includes(group.key) ? 'semantic' : 'local');
  }
}

/** Visual classification only; never changes the persisted code or category. */
export function classifyCorrectionVisualType(annotation: FeedbackAnnotation): CorrectionVisualType {
  const code = (annotation.symbol || '').trim().toUpperCase();
  const canonical = types.get(code);
  if (canonical) return canonical;
  // Historical aliases previously supported by the overlay, not new legend codes.
  if (code === 'CON' || code === 'ORG') return 'semantic';
  const category = (annotation.category || annotation.group || '').trim().toUpperCase();
  return ['CONTENT', 'ORGANIZATION'].includes(category) ? 'semantic' : 'local';
}
