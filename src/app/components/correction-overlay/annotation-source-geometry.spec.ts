import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CorrectionOverlay } from './correction-overlay';
import { correctionGeometryTargets } from '../../utils/correction-bbox.util';
import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import { ANNOTATION_IMAGE_FIXTURES } from '../../../testing/fixtures/annotation-image-fixtures';

// The API's canonical boxes are already in oriented image-content percentages.
// EXIF fixtures encode the same visible content with different raw pixel axes.
const words = [{ id: 'evidence', text: 'time', bbox: { x: 10, y: 15, w: 10, h: 5 } },
  { id: 'target', text: 'time', bbox: { x: 70, y: 40, w: 10, h: 5 } }];
const correction: FeedbackAnnotation = { _id: 'same-correction', submissionId: 's', fileId: 'f', page: 1,
  symbol: 'SP', category: 'MECHANICS', source: 'AI', editable: false, wordIds: ['evidence'], evidenceWordIds: ['evidence'],
  message: 'Same message', suggestedText: 'Same suggestion', confidence: .9,
  bboxList: [words[0].bbox], visualTarget: { version: 1, wordIds: ['target'], anchors: [] },
  renderTarget: { version: 1, source: 'visualTarget', wordIds: ['target'], anchors: [], boxes: [words[1].bbox] } };

describe('canonical image-content geometry', () => {
  let fixture: ComponentFixture<CorrectionOverlay>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CorrectionOverlay] }).compileComponents();
    fixture = TestBed.createComponent(CorrectionOverlay);
  });
  afterEach(() => fixture.destroy());

  async function render(url: string, width: number): Promise<HTMLImageElement> {
    fixture.nativeElement.style.width = `${width}px`;
    fixture.componentRef.setInput('fileId', 'f');
    fixture.componentRef.setInput('submissionId', 's');
    fixture.componentRef.setInput('ocrWords', words);
    fixture.componentRef.setInput('annotations', [{ ...correction, ...correctionGeometryTargets(correction) }]);
    const source = ANNOTATION_IMAGE_FIXTURES.find(item => item.url === url)!;
    fixture.componentRef.setInput('sourceGeometry', { version: 1, fileId: 'f', pageNumber: 1,
      width: source.width, height: source.height, orientation: source.orientation || 1,
      coordinateSpace: 'display-image', ambiguous: false });
    fixture.componentRef.setInput('imageUrl', url);
    fixture.detectChanges();
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    await image.decode(); fixture.componentInstance.onImageLoad({ target: image } as unknown as Event);
    fixture.detectChanges();
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return image;
  }

  for (const source of ANNOTATION_IMAGE_FIXTURES) for (const width of [320, 375, 430, 768, 1024, 1440]) {
    it(`keeps the same visible source target for ${source.name} at ${width}px`, async () => {
      const frozen = JSON.stringify({ correction, words, score: 72 });
      const image = await render(source.url, width);
      expect(image.naturalWidth).toBe(source.width); expect(image.naturalHeight).toBe(source.height);
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      const pixel = context.getImageData(Math.floor(canvas.width * .75), Math.floor(canvas.height * .425), 1, 1).data;
      expect(pixel[1]).toBeGreaterThan(pixel[0] + 50);
      expect(pixel[1]).toBeGreaterThan(pixel[2] + 50);
      const component = fixture.componentInstance, rect = image.getBoundingClientRect();
      expect(component.underlineSegments).toHaveSize(1);
      const target = component.underlineSegments[0];
      expect(target.left).toBeGreaterThan(69); expect(target.top).toBeGreaterThanOrEqual(45);
      const underline = fixture.nativeElement.querySelector('.correction-overlay__underline').getBoundingClientRect();
      expect(Math.abs(underline.left - rect.left - target.left * rect.width / 100)).toBeLessThan(.6);
      expect(Math.abs(underline.top - rect.top - target.top * rect.height / 100)).toBeLessThan(.6);
      expect(component.markers[0].annotations[0]._id).toBe(correction._id);
      expect(JSON.stringify({ correction, words, score: 72 })).toBe(frozen);
    });
  }
  it('reproduces discarded-target misalignment and fixes it without changing the API correction', async () => {
    await render(ANNOTATION_IMAGE_FIXTURES[0].url, 375);
    const { renderTarget: _renderTarget, visualTarget: _visualTarget, evidenceWordIds: _evidence, ...oldMapped } = correction;
    void _renderTarget; void _visualTarget; void _evidence;
    const before = JSON.stringify(correction);
    fixture.componentRef.setInput('annotations', [oldMapped]); fixture.detectChanges();
    expect(fixture.componentInstance.underlineSegments[0].left).toBeLessThan(11);
    fixture.componentRef.setInput('annotations', [{ ...oldMapped, ...correctionGeometryTargets(correction) }]);
    fixture.detectChanges();
    expect(fixture.componentInstance.underlineSegments[0].left).toBeGreaterThan(69);
    expect(JSON.stringify(correction)).toBe(before);
  });
  it('fails closed for explicit file/submission/page mismatches without altering the input correction list', async () => {
    await render(ANNOTATION_IMAGE_FIXTURES[0].url, 375);
    const annotations = [correction, { ...correction, _id: 'other-file', fileId: 'other' },
      { ...correction, _id: 'other-submission', submissionId: 'other' }, { ...correction, _id: 'other-page', page: 2 }];
    const frozen = JSON.stringify(annotations);
    fixture.componentRef.setInput('annotations', annotations); fixture.detectChanges();
    expect(fixture.componentInstance.markers.flatMap(g => g.annotations.map(a => a._id))).toEqual(['same-correction']);
    fixture.componentRef.setInput('fileId', 'other'); fixture.detectChanges();
    expect(fixture.componentInstance.markers).toHaveSize(0);
    fixture.componentRef.setInput('sourceGeometry', { ...fixture.componentInstance.sourceGeometry!, fileId: 'other' });
    fixture.detectChanges();
    expect(fixture.componentInstance.markers.flatMap(g => g.annotations.map(a => a._id))).toEqual(['other-file']);
    expect(JSON.stringify(annotations)).toBe(frozen);
  });
});
