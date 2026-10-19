import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CorrectionOverlay } from './correction-overlay';
import { imagePresentationGeometry, orientedBox, type AnnotationImageGeometry } from './annotation-image-geometry';
import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import { ANNOTATION_IMAGE_FIXTURES } from '../../../testing/fixtures/annotation-image-fixtures';

describe('encoded source to browser EXIF coordinates', () => {
  it('does not project ambiguous EXIF-3 or mismatched image dimensions', () => {
    const words = [{ id: 'w', text: 'blindely', bbox: { x: 10, y: 20, w: 15, h: 5 } }];
    const geometry = { version: 1, fileId: 'f', pageNumber: 1, width: 600, height: 800,
      orientation: 3, coordinateSpace: 'encoded-image', ambiguous: true };
    expect((imagePresentationGeometry as any)([], words, geometry, 'f', 1, 600, 800).words).toBe(words);
    expect((imagePresentationGeometry as any)([], words, { ...geometry, ambiguous: false }, 'f', 1, 300, 400).words).toBe(words);
  });
  it('projects the real source first-word control rather than guessing from image dimensions', () => {
    expect(orientedBox({ x: 84.625, y: 90.16666666666666, w: 7.375, h: 3.83333333333333 }, 3).x).toBe(8);
    expect(orientedBox({ x: 84.625, y: 90.16666666666666, w: 7.375, h: 3.83333333333333 }, 3).y).toBeCloseTo(6, 8);
  });
  it('defines exact clockwise EXIF 6 and counterclockwise EXIF 8 axes', () => {
    expect(orientedBox({ x: 40, y: 20, w: 5, h: 10 }, 6)).toEqual({ x: 70, y: 40, w: 10, h: 5 });
    expect(orientedBox({ x: 55, y: 70, w: 5, h: 10 }, 8)).toEqual({ x: 70, y: 40, w: 10, h: 5 });
  });
  it('preserves original canonical objects and skips unknown, already-oriented or mismatched identities', () => {
    const words = [{ id: 'w', text: 'word', bbox: { x: 20, y: 55, w: 10, h: 5 } }];
    const annotations: FeedbackAnnotation[] = [{ _id: 'c', submissionId: 's', fileId: 'f', page: 1, source: 'AI', editable: false,
      wordIds: ['w'], evidenceWordIds: ['w'], bboxList: [words[0].bbox], visualTarget: { version: 1, wordIds: [],
        anchors: [{ wordId: 'w', side: 'after', operation: 'INSERT' }] },
      renderTarget: { version: 1, source: 'visualTarget', wordIds: ['w'], anchors: [], boxes: [words[0].bbox] } }];
    const geometry: AnnotationImageGeometry = { version: 1, fileId: 'f', pageNumber: 1, width: 600, height: 800,
      orientation: 3, coordinateSpace: 'encoded-image' };
    const frozen = JSON.stringify({ annotations, words });
    const result = imagePresentationGeometry(annotations, words, geometry, 'f', 1);
    expect(result.words[0].bbox).toEqual({ x: 70, y: 40, w: 10, h: 5 });
    expect(result.annotations[0].renderTarget?.boxes[0]).toEqual(result.words[0].bbox!);
    expect(result.annotations[0].visualTarget).toBe(annotations[0].visualTarget);
    expect(result.annotations[0].wordIds).toBe(annotations[0].wordIds);
    expect(JSON.stringify({ annotations, words })).toBe(frozen);
    for (const metadata of [null, { ...geometry, coordinateSpace: 'display-image' as const }, { ...geometry, orientation: 1 as const }]) {
      expect(imagePresentationGeometry(annotations, words, metadata, 'f', 1).words).toBe(words);
    }
    expect(imagePresentationGeometry(annotations, words, geometry, 'other', 1).words).toBe(words);
    expect(imagePresentationGeometry(annotations, words, geometry, 'f', 2).words).toBe(words);
  });
});

describe('raw OCR EXIF overlay mapping', () => {
  let fixture: ComponentFixture<CorrectionOverlay>;
  beforeEach(async () => { await TestBed.configureTestingModule({ imports: [CorrectionOverlay] }).compileComponents(); fixture = TestBed.createComponent(CorrectionOverlay); });
  afterEach(() => fixture.destroy());
  for (const source of ANNOTATION_IMAGE_FIXTURES) for (const width of [320, 375, 430, 768, 1024, 1440]) {
    it(`maps raw source ${source.name} correctly at ${width}px`, async () => {
      const orientation = source.orientation || 1;
      const box = orientation === 3 ? { x: 20, y: 55, w: 10, h: 5 } : orientation === 6
        ? { x: 40, y: 20, w: 5, h: 10 } : orientation === 8 ? { x: 55, y: 70, w: 5, h: 10 }
          : { x: 70, y: 40, w: 10, h: 5 };
      const words = [{ id: 'exact-word', text: 'word', bbox: box }];
      const annotations: FeedbackAnnotation[] = [{ _id: 'unchanged', submissionId: 's', fileId: 'f', page: 1,
        source: 'AI', editable: false, symbol: 'SP', wordIds: ['exact-word'], bboxList: [box],
        renderTarget: { version: 1, source: 'wordIds', wordIds: ['exact-word'], anchors: [], boxes: [box] } }];
      const frozen = JSON.stringify({ annotations, words, score: 72 });
      fixture.nativeElement.style.width = width + 'px';
      for (const [key, value] of Object.entries({ imageUrl: source.url, annotations, ocrWords: words, fileId: 'f', submissionId: 's',
        sourceGeometry: { version: 1, coordinateSpace: 'encoded-image', fileId: 'f', pageNumber: 1, width: [6, 8].includes(orientation) ? 80 : 60,
          height: [6, 8].includes(orientation) ? 60 : 80, orientation } })) fixture.componentRef.setInput(key, value);
      fixture.detectChanges(); const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
      await image.decode(); fixture.componentInstance.onImageLoad({ target: image } as unknown as Event); fixture.detectChanges();
      const target = fixture.componentInstance.underlineSegments[0];
      expect(target.left).toBeGreaterThan(69); expect(target.left).toBeLessThanOrEqual(70);
      expect(target.top).toBeGreaterThanOrEqual(45);
      const r = image.getBoundingClientRect(), actual = fixture.nativeElement.querySelector('.correction-overlay__underline').getBoundingClientRect();
      expect(Math.abs(actual.left - r.left - target.left * r.width / 100)).toBeLessThan(.6);
      expect(Math.abs(actual.top - r.top - target.top * r.height / 100)).toBeLessThan(.6);
      expect(JSON.stringify({ annotations, words, score: 72 })).toBe(frozen);
    });
  }
});
