export interface FlashCard {
  _id?: string;
  front: string;
  back: string;
  frontImage?: string;
  backImage?: string;
  order: number;
  template?: string;
}

export interface CardResult {
  cardId: string;
  known: boolean;
  studentAnswer?: string;
  isCorrect?: boolean;
}

export interface FlashcardSet {
  _id: string;
  title: string;
  description: string;
  cards?: FlashCard[];
  cardCount?: number;
  visibility: 'public' | 'private';
  folderId?: string;
  language: string;
  template?: string;
  ownerId?: string;
  ownerName?: string;
  assignedClasses?: string[];
  submissionCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface StudyResult {
  cardId: string;
  status: 'know' | 'learning';
}

export interface Submission {
  _id?: string;
  flashcardSetId: string;
  results: StudyResult[];
  score: number;
  timeTaken: number;
  submittedAt?: Date;
}

export interface GenerateFlashcardPayload {
  inputType: 'topic' | 'text' | 'webpage' | 'file';
  content: string;
  template: string;
  cardCount: number | 'auto';
  language: string;
}

export interface FlashcardReport {
  totalSubmissions: number;
  averageScore: number;
  medianTimeTaken: number;
  participants: ParticipantResult[];
  cards: CardStat[];
}

export interface ParticipantResult {
  userId: string;
  userName: string;
  score: number;
  timeTaken: number;
  submittedAt: Date;
  status: 'completed';
}

export interface CardStat {
  cardId: string;
  front: string;
  correctPercentage: number;
}
