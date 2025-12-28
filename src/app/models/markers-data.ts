export type Group = 'Content' | 'Organization' | 'Grammar' | 'Vocabulary' | 'Mechanics';

export interface Marker {
    id: number;
    left: number; // percent position
    top: number;  // percent position
    symbol: string;
    group: Group;
    short: string;
    title: string;
    description: string;
    colorClass: string; // Tailwind background color class
    visible?: boolean;  // ✅ added to support tooltip visibility
}

export const SAMPLE_MARKERS: Marker[] = [
    {
        id: 1,
        left: 15,
        top: 10,
        symbol: 'REL',
        group: 'Content',
        short: 'REL – Relevance',
        title: 'Relevance',
        description:
            'This paragraph does not clearly relate to the prompt. Refocus the idea to address the essay question directly.',
        colorClass: 'bg-amber-200 text-amber-800',
    },
    {
        id: 2,
        left: 40,
        top: 18,
        symbol: 'DEV',
        group: 'Content',
        short: 'DEV – Idea Development',
        title: 'Idea Development',
        description:
            'The point is too general. Add specific examples or data to support your argument.',
        colorClass: 'bg-amber-200 text-amber-800',
    },
    {
        id: 3,
        left: 68,
        top: 22,
        symbol: 'COH',
        group: 'Organization',
        short: 'COH – Coherence',
        title: 'Coherence / Flow',
        description:
            'Sentences do not flow logically. Consider reordering sentences and adding transitions.',
        colorClass: 'bg-sky-200 text-sky-800',
    },
    {
        id: 4,
        left: 25,
        top: 38,
        symbol: 'TS',
        group: 'Organization',
        short: 'TS – Topic Sentence',
        title: 'Missing Topic Sentence',
        description:
            'Start this paragraph with a clear topic sentence to state the main idea.',
        colorClass: 'bg-sky-200 text-sky-800',
    },
    {
        id: 5,
        left: 50,
        top: 46,
        symbol: 'T',
        group: 'Grammar',
        short: 'T – Tense',
        title: 'Tense',
        description:
            'Inconsistent tense usage. Keep the same tense throughout this paragraph (prefer simple present for general statements).',
        colorClass: 'bg-emerald-200 text-emerald-800',
    },
    {
        id: 6,
        left: 72,
        top: 54,
        symbol: 'AGR',
        group: 'Grammar',
        short: 'AGR – Subject–Verb Agreement',
        title: 'Subject–Verb Agreement',
        description:
            'The verb does not agree with the subject (e.g., "they is" → "they are").',
        colorClass: 'bg-emerald-200 text-emerald-800',
    },
    {
        id: 7,
        left: 18,
        top: 70,
        symbol: 'WC',
        group: 'Vocabulary',
        short: 'WC – Word Choice',
        title: 'Word Choice',
        description:
            'A more academic or precise word would improve clarity here (e.g., use "implement" instead of "do").',
        colorClass: 'bg-violet-200 text-violet-800',
    },
    {
        id: 8,
        left: 55,
        top: 78,
        symbol: 'REP',
        group: 'Vocabulary',
        short: 'REP – Repetition',
        title: 'Repetition',
        description:
            'The word "achieve" repeats too often. Use synonyms or restructure to avoid repetition.',
        colorClass: 'bg-violet-200 text-violet-800',
    },
    {
        id: 9,
        left: 80,
        top: 86,
        symbol: 'SP',
        group: 'Mechanics',
        short: 'SP – Spelling',
        title: 'Spelling',
        description:
            'Spelling mistake: check this word and correct to the standard form.',
        colorClass: 'bg-yellow-100 text-yellow-800',
    },
];
