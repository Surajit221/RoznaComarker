import type { CorrectionLegend } from '../models/correction-legend.model';

export const DEFAULT_CORRECTION_LEGEND: CorrectionLegend = {
  version: '1.0',
  description: 'Academic correction legend for AI-assisted writing feedback',
  groups: [
    {
      key: 'CONTENT',
      label: 'Content (Ideas & Relevance)',
      color: '#FFD6A5',
      symbols: [
        { symbol: 'REL', label: 'Relevance', description: 'The idea is not related to the topic or task.' },
        {
          symbol: 'DEV',
          label: 'Idea Development',
          description: 'The point is too general or lacks details or examples.'
        },
        {
          symbol: 'TA',
          label: 'Task Achievement',
          description: 'The response does not fully answer the prompt or question.'
        },
        { symbol: 'CL', label: 'Clarity of Ideas', description: 'The message is unclear or confusing.' },
        {
          symbol: 'SD',
          label: 'Supporting Details',
          description: 'Examples or explanations are missing to support the main idea.'
        }
      ]
    },
    {
      key: 'ORGANIZATION',
      label: 'Organization (Structure & Flow)',
      color: '#CDE7F0',
      symbols: [
        { symbol: 'COH', label: 'Coherence', description: 'Ideas are not logically connected.' },
        { symbol: 'CO', label: 'Cohesion', description: 'Linking words or transitions are missing or misused.' },
        { symbol: 'PU', label: 'Paragraph Unity', description: 'The paragraph contains unrelated ideas.' },
        { symbol: 'TS', label: 'Topic Sentence', description: 'The topic sentence is missing or unclear.' },
        { symbol: 'CONC', label: 'Conclusion', description: 'The conclusion is weak or missing.' }
      ]
    },
    {
      key: 'GRAMMAR',
      label: 'Grammar (Sentence & Structure)',
      color: '#B7E4C7',
      symbols: [
        { symbol: 'T', label: 'Tense', description: 'Incorrect verb tense.' },
        { symbol: 'VF', label: 'Verb Form', description: 'Incorrect verb form.' },
        { symbol: 'AGR', label: 'Subject–Verb Agreement', description: 'The verb does not agree with the subject.' },
        { symbol: 'FRAG', label: 'Sentence Fragment', description: 'Incomplete sentence missing a subject or verb.' },
        { symbol: 'RO', label: 'Run-on Sentence', description: 'Two or more sentences are joined incorrectly.' },
        { symbol: 'WO', label: 'Word Order', description: 'The order of words in the sentence is incorrect.' },
        { symbol: 'ART', label: 'Article Use', description: 'Missing or incorrect article (a, an, the).' },
        { symbol: 'PREP', label: 'Preposition', description: 'Incorrect or missing preposition.' }
      ]
    },
    {
      key: 'VOCABULARY',
      label: 'Vocabulary (Word Use & Form)',
      color: '#E4C1F9',
      symbols: [
        { symbol: 'WC', label: 'Word Choice', description: 'A more suitable word could be used.' },
        { symbol: 'WF', label: 'Word Form', description: 'Incorrect form of the word.' },
        { symbol: 'REP', label: 'Repetition', description: 'The same word or phrase is repeated too often.' },
        {
          symbol: 'FORM',
          label: 'Formal / Inappropriate Word',
          description: 'The word is too informal or not suitable for academic context.'
        },
        { symbol: 'COL', label: 'Collocation', description: 'Words do not naturally go together.' }
      ]
    },
    {
      key: 'MECHANICS',
      label: 'Mechanics (Spelling & Punctuation)',
      color: '#FFF3BF',
      symbols: [
        { symbol: 'SP', label: 'Spelling', description: 'The word is spelled incorrectly.' },
        { symbol: 'P', label: 'Punctuation', description: 'Punctuation mark is missing, extra, or incorrect.' },
        { symbol: 'CAP', label: 'Capitalization', description: 'Incorrect use of capital or lowercase letters.' },
        { symbol: 'SPC', label: 'Spacing', description: 'Missing or extra space between words or sentences.' },
        { symbol: 'FMT', label: 'Formatting', description: 'Inconsistent formatting, alignment, or spacing.' }
      ]
    }
  ]
};
