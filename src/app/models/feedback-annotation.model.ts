import type { OcrBBox } from './ocr-token.model';

export type FeedbackAnnotationSource = 'AI' | 'Teacher';

export interface FeedbackAnnotation {
    _id: string;
    submissionId: string;
    page?: number;
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
