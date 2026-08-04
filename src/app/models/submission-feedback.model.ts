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
  weight?: number;
  cells: string[];
}

export interface RubricDesigner {
  title: string;
  totalPoints?: number;
  levels: RubricDesignerLevel[];
  criteria: RubricDesignerCriteriaRow[];
}

export interface CustomRubricCriterionScore {
  criterionId: string;
  title: string;
  normalizedWeight: number;
  selectedLevel: string;
  configuredLevelPercentage: number;
  weightedPoints: number;
  comment: string;
  evidenceIds: string[];
  weight?: number;
  percentage?: number;
  levelTitle?: string;
}

export interface CustomRubricScores {
  overallScore: number;
  criteria: CustomRubricCriterionScore[];
}

export interface SourceRubric {
  version: string;
  source: 'rubrics' | 'rubric';
  title: string;
  totalPoints: number;
  criteria: Array<{
    id: string;
    title: string;
    weight: number;
    levels: Array<{ title: string; percentage: number; description: string }>;
  }>;
}

export interface ScoringAudit {
  overallMethod: 'custom_rubric_weighted_total' | 'fixed_six_category_sum';
  rubricHash?: string;
  policyHash?: string;
  customRubric?: {
    overallScore: number;
    criteria: Array<{
      criterionId: string;
      normalizedWeight: number;
      selectedLevel: string;
      configuredLevelPercentage: number;
      weightedPoints: number;
    }>;
  };
}

export interface PreviousEvaluation {
  overallScore: number;
  grade: string | null;
  rubricScores: SubmissionFeedback['rubricScores'] | null;
  customRubricScores: CustomRubricScores | null;
  sourceRubric: SourceRubric | null;
  scoringAudit: ScoringAudit | null;
  detailedFeedback: DetailedFeedback | null;
  evaluationSourceHash: string;
  evaluationRubricSourceHash: string | null;
  evaluationPolicyHash: string | null;
  evaluationVersion: string | null;
  assessmentVersion: string | null;
}

export interface SubmissionFeedback {
  submissionId: string;
  classId?: string;
  studentId?: string;
  teacherId?: string;

  overallComments?: string;
  teacherComments?: string;
  teacherCommentsUpdatedAt?: string;
  teacherCommentsUpdatedBy?: string;

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
  customRubricScores?: CustomRubricScores;
  sourceRubric?: SourceRubric;
  scoringAudit?: ScoringAudit;
  previousEvaluation?: PreviousEvaluation | null;

  overriddenByTeacher: boolean;
  detailedFeedbackSourceHash?: string;
  detailedFeedbackVersion?: string;

  createdAt?: string;
  updatedAt?: string;
}
