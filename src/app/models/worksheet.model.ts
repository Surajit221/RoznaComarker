export type WorksheetRole = 'producer' | 'consumer' | 'decomposer';

export interface WorksheetActivityResult {
  completed: boolean;
  score: number;
  maxScore: number;
  selections?: unknown;
}

export interface FoodChainStep {
  id: string;
  label: string;
  emoji: string;
  role: string;
}

export interface MatchCardOption {
  value: WorksheetRole;
  label: string;
  emoji: string;
}

export interface MatchCardData {
  id: string;
  title: string;
  clue: string;
  emoji: string;
  answer: WorksheetRole;
  explanation: string;
  selectedRole?: WorksheetRole | null;
  revealed?: boolean;
}

export interface QuizOption {
  id: string;
  label: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  explanation: string;
  answerId: string;
  options: QuizOption[];
  selectedOptionId?: string | null;
  revealed?: boolean;
}

export interface FillBlankWord {
  id: string;
  label: string;
}

export interface FillBlankPrompt {
  id: string;
  before: string;
  answerId: string;
  after: string;
}
