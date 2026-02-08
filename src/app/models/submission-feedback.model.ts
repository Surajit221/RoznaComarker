export interface RubricItem {
  score: number;
  maxScore: 5;
  comment: string;
}

export interface CorrectionStats {
  content: number;
  grammar: number;
  organization: number;
  vocabulary: number;
  mechanics: number;
}

export interface DetailedFeedback {
  strengths: string[];
  areasForImprovement: string[];
  actionSteps: string[];
}

export interface AiFeedbackPerCategory {
  category: string;
  message: string;
  scoreOutOf5: number;
}

export interface AiFeedback {
  perCategory: AiFeedbackPerCategory[];
  overallComments: string;
}

export interface SubmissionFeedback {
  submissionId: string;
  classId?: string;
  studentId?: string;
  teacherId?: string;

  overallComments?: string;
  teacherComments?: string;

  rubricScores: {
    CONTENT: RubricItem;
    ORGANIZATION: RubricItem;
    GRAMMAR: RubricItem;
    VOCABULARY: RubricItem;
    MECHANICS: RubricItem;
  };

  overallScore: number;
  grade: string;

  correctionStats: CorrectionStats;
  detailedFeedback: DetailedFeedback;
  aiFeedback: AiFeedback;

  overriddenByTeacher: boolean;

  createdAt?: string;
  updatedAt?: string;
}
