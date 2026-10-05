import type { OcrBBox } from './ocr-token.model';

export type FeedbackAnnotationSource = 'AI' | 'LANGUAGETOOL' | 'Teacher';

export interface FeedbackAnnotation {
    _id: string;
    submissionId: string;
    page?: number;
    fileId?: string;
    category?: string;
    quotedText?: string;
    confidence?: number;
    wordIds?: string[];
    evidenceWordIds?: string[];
    visualTarget?: { version: 1; wordIds: string[]; anchors: {
        wordId: string; side: 'before' | 'after'; operation: 'INSERT' | 'DELETE' | 'REPLACE'; punctuation?: string;
    }[] };
    renderTarget?: { version: 1; source: 'visualTarget' | 'wordIds' | 'bboxList' | 'none';
        wordIds: string[]; anchors: NonNullable<FeedbackAnnotation['visualTarget']>['anchors']; boxes: OcrBBox[] };
    ocrConfidence?: number | null;
    ocrSuspect?: boolean;
    bboxList?: OcrBBox[];
    group?: string;
    symbol?: string;
    color?: string;
    message?: string;
    suggestedText?: string;
    startChar?: number;
    endChar?: number;
    source: FeedbackAnnotationSource;
    editable: boolean;
}
