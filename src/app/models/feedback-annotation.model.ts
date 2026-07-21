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
