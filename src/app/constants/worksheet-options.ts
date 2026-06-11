// worksheet-options.ts
// All dropdown / static option data for the worksheet generator form.

export const CEFR_LEVELS: { value: string; label: string }[] = [
  { value: '',   label: 'CEFR Level' },
  { value: 'A1', label: 'A1 – Beginner' },
  { value: 'A2', label: 'A2 – Elementary' },
  { value: 'B1', label: 'B1 – Intermediate' },
  { value: 'B2', label: 'B2 – Upper Intermediate' },
  { value: 'C1', label: 'C1 – Advanced' },
  { value: 'C2', label: 'C2 – Proficient' },
];

export const SUBJECTS: { value: string; label: string }[] = [
  { value: '',                  label: 'Select subject...' },
  { value: 'english',           label: 'English' },
  { value: 'mathematics',       label: 'Mathematics' },
  { value: 'science',           label: 'Science' },
  { value: 'social_studies',    label: 'Social Studies' },
  { value: 'history',           label: 'History' },
  { value: 'geography',         label: 'Geography' },
  { value: 'art',               label: 'Art' },
  { value: 'music',             label: 'Music' },
  { value: 'ict',               label: 'ICT / Computer Science' },
  { value: 'religious_studies', label: 'Religious Studies' },
  { value: 'other',             label: 'Other' },
];

export const GRADE_CATEGORIES: { value: string; label: string }[] = [
  { value: '',           label: 'Select category...' },
  { value: 'early',      label: 'Early Childhood (Pre-K – K)' },
  { value: 'primary',    label: 'Primary (Grade 1–5)' },
  { value: 'middle',     label: 'Middle School (Grade 6–8)' },
  { value: 'secondary',  label: 'Secondary (Grade 9–12)' },
  { value: 'higher',     label: 'Higher Education' },
];

export const GRADE_LEVELS_BY_CATEGORY: Record<string, { value: string; label: string }[]> = {
  early: [
    { value: 'pre_k', label: 'Pre-K' },
    { value: 'k',     label: 'Kindergarten' },
  ],
  primary: [
    { value: 'grade_1', label: 'Grade 1' },
    { value: 'grade_2', label: 'Grade 2' },
    { value: 'grade_3', label: 'Grade 3' },
    { value: 'grade_4', label: 'Grade 4' },
    { value: 'grade_5', label: 'Grade 5' },
  ],
  middle: [
    { value: 'grade_6', label: 'Grade 6' },
    { value: 'grade_7', label: 'Grade 7' },
    { value: 'grade_8', label: 'Grade 8' },
  ],
  secondary: [
    { value: 'grade_9',  label: 'Grade 9' },
    { value: 'grade_10', label: 'Grade 10' },
    { value: 'grade_11', label: 'Grade 11' },
    { value: 'grade_12', label: 'Grade 12' },
  ],
  higher: [
    { value: 'undergraduate', label: 'Undergraduate' },
    { value: 'postgraduate',  label: 'Postgraduate' },
  ],
};

export const DIFFICULTIES: { value: string; label: string }[] = [
  { value: 'easy',   label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard',   label: 'Hard' },
];

export const LANGUAGES: { value: string; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'bn', label: 'Bengali' },
  { value: 'ar', label: 'Arabic' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'de', label: 'German' },
  { value: 'zh', label: 'Chinese' },
  { value: 'hi', label: 'Hindi' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
];

export const THEMES: { value: string; label: string }[] = [
  { value: 'default', label: 'Default Theme' },
  { value: 'green',   label: 'Green Nature' },
  { value: 'blue',    label: 'Ocean Blue' },
  { value: 'purple',  label: 'Purple Haze' },
  { value: 'orange',  label: 'Warm Orange' },
  { value: 'red',     label: 'Classic Red' },
  { value: 'teal',    label: 'Teal' },
];
