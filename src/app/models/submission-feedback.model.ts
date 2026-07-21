export interface RubricItem {
  score: number;
  maxScore: number;
  comment: string;
}

export interface CorrectionStats {
  content: number;
  grammar: number;
  organization: number;
  vocabulary: number;
  mechanics: number;
  total?: number;
}

export interface DetailedFeedbackExample { correctionId: string; symbol: string; symbolLabel?: string; quotedText: string; message: string; suggestedText: string; }
export interface DetailedFeedbackArea { id: string; category: string; title: string; issueCount: number; score: number; maxScore: number; explanation: string; dominantSymbols: string[]; examples: DetailedFeedbackExample[]; }
export interface DetailedFeedbackStrength { id: string; category: string; title: string; score: number; maxScore: number; explanation: string; evidence: string[]; provisional: boolean; }
export interface DetailedFeedbackActionStep { id: string; priority: number; category: string; action: string; reason: string; relatedSymbols: string[]; relatedCorrectionIds: string[]; }
export interface DetailedFeedback { status?: string; sourceHash?: string; evaluationVersion?: string; strengths: any[]; areasForImprovement: any[]; actionSteps: any[]; }

export interface AiFeedbackPerCategory {
  category: string;
  message: string;
  score: number;
  maxScore: number;
  scoreOutOf5?: number;
}

export interface AiFeedback {
  perCategory: AiFeedbackPerCategory[];
  overallComments: string;
}

export interface RubricDesignerLevel {
  title: string;
  maxPoints: number;
}

export interface RubricDesignerCriteriaRow {
  title: string;
  cells: string[];
}

export interface RubricDesigner {
  title: string;
  levels: RubricDesignerLevel[];
  criteria: RubricDesignerCriteriaRow[];
}

export interface SubmissionFeedback {
  submissionId: string;
  classId?: string;
  studentId?: string;
  teacherId?: string;

  overallComments?: string;
  teacherComments?: string;

  assessmentVersion?: string;
  maxOverallScore: number;

  rubricScores: {
    CONTENT: RubricItem;
    ORGANIZATION: RubricItem;
    GRAMMAR: RubricItem;
    VOCABULARY: RubricItem;
    MECHANICS: RubricItem;
    PRESENTATION: RubricItem;
  };

  overallScore: number | null;
  grade: string | null;

  correctionStats: CorrectionStats;
  correctionStatistics?: CorrectionStats;
  detailedFeedback: DetailedFeedback;
  aiFeedback: AiFeedback;

  rubricDesigner?: RubricDesigner;

  overriddenByTeacher: boolean;
  detailedFeedbackSourceHash?: string;
  detailedFeedbackVersion?: string;

  createdAt?: string;
  updatedAt?: string;
}
