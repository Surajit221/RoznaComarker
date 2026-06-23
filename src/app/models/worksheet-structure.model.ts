export interface WorksheetSection {
  title: string;
  type: 'multiple_choice' | 'fill_blank' | 'ordering' | 'classification' | 'short_answer' | 'matching' | 'drawing' | 'table';
  questionCount: number;
  layoutHint: string;
  instructions: string;
}

export interface WorksheetStructure {
  sections: WorksheetSection[];
  totalQuestions: number;
  pageLayout: 'single_column' | 'two_column' | 'grid' | 'mixed';
  visualStyle: string;
  hasHeader: boolean;
  hasStudentInfoSection: boolean;
  difficultyHint: 'easy' | 'medium' | 'hard';
  subjectHint: string;
  designNotes: string;
  worksheetStyle?: 'diagram' | 'questions' | 'mixed';
  recommendedActivityType?: string;
  labelCount?: number;
}
