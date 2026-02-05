export interface OcrBBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface OcrWord {
    id: string;
    text: string;
    bbox: OcrBBox | null;
}

export interface OcrLine {
    id: string;
    text: string;
    wordIds: string[];
}

export interface OcrPage {
    pageNumber: number;
    width: number | null;
    height: number | null;
    words: OcrWord[];
    lines: OcrLine[];
}

export interface NormalizedOcrResult {
    pages: OcrPage[];
    fullText: string;
}
