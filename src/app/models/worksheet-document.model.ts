// worksheet-document.model.ts
// Frontend mirror of the backend's src/types/worksheet.ts
// Single source of truth for all WorksheetDocument-related types used by the renderer.

// ─── Activity / Question Types ────────────────────────────────────────────────

export type ActivityType =
  | 'ordering_sequencing'
  | 'classification'
  | 'multiple_choice'
  | 'fill_in_blanks'
  | 'matching_pairs'
  | 'true_false'
  | 'short_answer';

/** Backward-compatibility alias. New code should use ActivityType. */
export type QuestionType = ActivityType;

export const ACTIVITY_TYPE_META: Record<
  ActivityType,
  { label: string; description: string; icon: string }
> = {
  ordering_sequencing: {
    label: 'Ordering/Sequencing',
    description: 'Arrange items in correct order',
    icon: '🔢',
  },
  classification: {
    label: 'Classification',
    description: 'Categorize items into groups',
    icon: '🗂️',
  },
  multiple_choice: {
    label: 'Multiple Choice',
    description: 'Answer multiple choice questions',
    icon: '⭕',
  },
  fill_in_blanks: {
    label: 'Fill in the Blanks',
    description: 'Complete sentences with missing words',
    icon: '✏️',
  },
  matching_pairs: {
    label: 'Matching Pairs',
    description: 'Match related items together',
    icon: '🔗',
  },
  true_false: {
    label: 'True/False',
    description: 'Determine if statements are true or false',
    icon: '✅',
  },
  short_answer: {
    label: 'Short Answer',
    description: 'Write brief responses to questions',
    icon: '📝',
  },
};

export const MAX_ACTIVITY_TYPES = 6;

// ─── Layout / Scheme ──────────────────────────────────────────────────────────

export type LayoutType = 'single_column' | 'two_column' | 'diagram_with_boxes' | 'grid' | 'table';

export interface WorksheetColorScheme {
  primary: string;
  primaryLight: string;
  background: string;
  text: string;
  accent: string;
  headerBg: string;
  headerText: string;
  boxBorder: string;
  labelBg: string;
  labelText: string;
}

// ─── Section content interfaces ───────────────────────────────────────────────

export interface HeaderContent {
  showNameField: boolean;
  showDateField: boolean;
  showClassField: boolean;
  title: string;
  subtitle?: string;
  logoUrl?: string;
  decorativeImageUrl?: string;
}

export interface InstructionsContent {
  text: string;
  bold?: boolean;
  alignment?: 'left' | 'center' | 'justify';
}

export interface Question {
  id: string;
  number: number;
  type: ActivityType;
  questionText: string;
  writeLines?: number;
  // Multiple choice
  options?: string[];
  // Matching pairs
  matchPairs?: { left: string; right: string }[];
  // Ordering/sequencing
  items?: string[];
  correctOrder?: string[];
  // Classification
  categories?: string[];
  classificationItems?: string[];
  classificationAnswers?: Record<string, string[]>;
  // Common
  answer?: string;
  points?: number;
  imageUrl?: string;
  sectionTitle?: string;
}

export interface QuestionBlockContent {
  sectionTitle?: string;
  showSectionTitle: boolean;
  questions: Question[];
  layout: LayoutType;
  columns?: number;
}

export interface DiagramLabel {
  id: string;
  labelName: string;
  position:
    | 'top'
    | 'top-right'
    | 'right'
    | 'bottom-right'
    | 'bottom'
    | 'bottom-left'
    | 'left'
    | 'top-left';
  writeLines: number;
  boxWidth?: string;
}

export interface DiagramLabelsContent {
  centralImage: {
    query: string;
    url: string;
    alt: string;
    position: 'left' | 'center' | 'right';
    width?: string;
  };
  labels: DiagramLabel[];
  instructions?: string;
}

export interface WordBankContent {
  title: string;
  words: string[];
}

export interface FooterContent {
  leftText: string;
  rightText?: string;
  showPageNumber?: boolean;
}

export type WorksheetSectionType =
  | 'header'
  | 'instructions'
  | 'question_block'
  | 'diagram_labels'
  | 'word_bank'
  | 'footer'
  | 'divider';

export interface WorksheetSection {
  id: string;
  type: WorksheetSectionType;
  content:
    | HeaderContent
    | InstructionsContent
    | QuestionBlockContent
    | DiagramLabelsContent
    | WordBankContent
    | FooterContent;
}

// ─── Root document ────────────────────────────────────────────────────────────

export interface WorksheetDocument {
  id: string;
  version: '1.0';
  createdAt: string;
  createdBy: string;
  source: 'text_prompt' | 'file_upload';
  sourceFileUrl?: string;
  meta: {
    title: string;
    description?: string;
    subject: string;
    topic: string;
    gradeCategory: string;
    gradeLevel: string;
    cefrLevel?: string;
    estimatedMinutes: number;
    difficulty: 'easy' | 'medium' | 'hard';
    theme: string;
    activityTypes: ActivityType[];
    tags: string[];
    language: string;
  };
  design: {
    colorScheme: WorksheetColorScheme;
    layout: LayoutType;
    fontFamily: string;
    fontSize: 'small' | 'medium' | 'large';
    pageSize: 'A4' | 'Letter';
    margins: 'narrow' | 'normal' | 'wide';
    hasDecorativeImage: boolean;
  };
  sections: WorksheetSection[];
  answerKey: { questionId: string; answer: string }[];
}
