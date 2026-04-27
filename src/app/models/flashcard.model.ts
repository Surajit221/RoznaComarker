export interface FlashCard {
  id?: string;
  question: string;
  answer: string;
  isEditing?: boolean;
}

export interface FlashCardSet {
  id?: string;
  title: string;
  cards: FlashCard[];
  classId?: string;
  assignmentId?: string;
  createdAt?: Date;
}
