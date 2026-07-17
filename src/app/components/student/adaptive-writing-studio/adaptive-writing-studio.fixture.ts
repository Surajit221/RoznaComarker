import type { AdaptivePracticeActivity } from './adaptive-writing-studio.types';

/** Development-only UI preview. This content must never be presented as submission-derived AI output. */
export const DEVELOPMENT_ADAPTIVE_PRACTICE_FIXTURE: readonly AdaptivePracticeActivity[] = [
  {
    id: 'preview-coherence',
    skillId: 'ORGANIZATION',
    category: 'Coherence & Flow',
    title: 'Improve Paragraph Flow',
    description: 'Learn to connect ideas clearly with linking words.',
    evidence: 'Preview example: AI is useful. It helps students. Also, teachers use it. But some people worry.',
    task: 'Rewrite the text using linking words to show relationships between ideas.',
    tip: 'Use linking words such as however, therefore, in addition, for example and as a result.',
    checklist: ['Ideas are connected logically.', 'Linking words show the relationship between ideas.', 'The revised text reads smoothly.'],
    modelAnswer: 'AI is useful because it helps students. In addition, teachers use it; however, some people remain concerned.',
    difficulty: 'developing',
    isDevelopmentPreview: true
  },
  {
    id: 'preview-lexical',
    skillId: 'VOCABULARY',
    category: 'Lexical Resource',
    title: 'Upgrade Your Vocabulary',
    description: 'Learn to use more precise and natural vocabulary.',
    evidence: 'Preview example: AI is very important in education. It is good for learning many things.',
    task: 'Rewrite the text using more specific and academic vocabulary.',
    tip: 'Replace general words such as very, good and many with more precise words.',
    checklist: ['General words are replaced with precise alternatives.', 'Vocabulary suits an academic context.', 'The meaning remains clear.'],
    modelAnswer: 'AI is increasingly significant in education because it supports learning across a wide range of subjects.',
    difficulty: 'developing',
    isDevelopmentPreview: true
  }
];

export const DEVELOPMENT_GENERATION_DELAY_MS = 450;
