import { TestBed } from '@angular/core/testing';
import { CorrectionOverlay } from './correction-overlay';
import { ANNOTATION_IMAGE_FIXTURES } from '../../../testing/fixtures/annotation-image-fixtures';
import { OVERLAY_INCIDENT_IMAGE_FIXTURES } from '../../../testing/fixtures/overlay-incident-image-fixtures';
describe('overlay incident coordinate authority', () => {
  it('keeps geometry stable across five fresh file identities for identical verified evidence', async () => {
    await TestBed.configureTestingModule({ imports: [CorrectionOverlay] }).compileComponents();
    const source = OVERLAY_INCIDENT_IMAGE_FIXTURES[0];
    const positions: Array<{ left: number; top: number; width: number }> = [];
    for (let run = 0; run < 5; run++) {
      const fixture = TestBed.createComponent(CorrectionOverlay); fixture.nativeElement.style.width = '768px';
      const fileId = `run-file-${run}`, wordId = `word_${fileId}_1_1`, box = { x: 10, y: 20, w: 15, h: 5 };
      for (const [key, value] of Object.entries({ imageUrl: source.url, fileId, submissionId: `s${run}`,
        sourceGeometry: { version: 1, fileId, pageNumber: 1, coordinateSpace: 'display-image',
          orientation: source.orientation, width: source.width, height: source.height },
        ocrWords: [{ id: wordId, text: 'blindely', bbox: box }],
        annotations: [{ _id: `c${run}`, fileId, submissionId: `s${run}`, page: 1, symbol: 'SP', wordIds: [wordId],
          renderTarget: { version: 1, source: 'wordIds', wordIds: [wordId], anchors: [], boxes: [box] } }] })) fixture.componentRef.setInput(key, value);
      fixture.detectChanges(); const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
      await image.decode(); fixture.componentInstance.onImageLoad({ target: image } as unknown as Event); fixture.detectChanges();
      const imageRect = image.getBoundingClientRect();
      const rect = fixture.nativeElement.querySelector('.correction-overlay__underline').getBoundingClientRect();
      positions.push({ left: rect.left - imageRect.left, top: rect.top - imageRect.top, width: rect.width });
      expect(fixture.componentInstance.markers).toHaveSize(1); fixture.destroy();
    }
    positions.forEach(position => expect(position).toEqual(positions[0]));
  });
  for (const source of OVERLAY_INCIDENT_IMAGE_FIXTURES) for (const width of [320, 768, 1440]) {
    it(`places the normalized control word on visible pixels: ${source.name}, ${width}px`, async () => {
      await TestBed.configureTestingModule({ imports: [CorrectionOverlay] }).compileComponents();
      const fixture = TestBed.createComponent(CorrectionOverlay); fixture.nativeElement.style.width = `${width}px`;
      const box = { x: 10, y: 20, w: 15, h: 5 };
      for (const [key, value] of Object.entries({ imageUrl: source.url, fileId: 'f', submissionId: 's',
        sourceGeometry: { version: 1, fileId: 'f', pageNumber: 1, coordinateSpace: 'display-image',
          ambiguous: false, orientation: source.orientation, width: source.width, height: source.height },
        ocrWords: [{ id: 'w', text: 'blindely', bbox: box }],
        annotations: [{ _id: 'c', fileId: 'f', submissionId: 's', page: 1, symbol: 'SP', quotedText: 'blindely', wordIds: ['w'],
          renderTarget: { version: 1, source: 'wordIds', wordIds: ['w'], anchors: [], boxes: [box] } }] })) fixture.componentRef.setInput(key, value);
      fixture.detectChanges(); const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
      await image.decode(); fixture.componentInstance.onImageLoad({ target: image } as unknown as Event); fixture.detectChanges();
      expect(image.naturalWidth).toBe(source.width); expect(image.naturalHeight).toBe(source.height);
      const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      const pixel = context.getImageData(Math.floor(source.width * .175), Math.floor(source.height * .225), 1, 1).data;
      expect(pixel[1]).toBeGreaterThan(pixel[0] + 80); expect(pixel[1]).toBeGreaterThan(pixel[2] + 80);
      const rect = image.getBoundingClientRect();
      const underline = fixture.nativeElement.querySelector('.correction-overlay__underline').getBoundingClientRect();
      expect(Math.abs((underline.left - rect.left) / rect.width * 100 - 10)).toBeLessThan(.5);
      expect(Math.abs((underline.top - rect.top) / rect.height * 100 - 25.6)).toBeLessThan(.5);
      expect(fixture.componentInstance.markers).toHaveSize(1);
      expect(rect.right).toBeLessThanOrEqual(fixture.nativeElement.getBoundingClientRect().right + .5);
      fixture.destroy();
    });
  }
  it('suppresses markers when the displayed image disagrees with persisted OCR dimensions', async () => {
    await TestBed.configureTestingModule({ imports: [CorrectionOverlay] }).compileComponents();
    const fixture = TestBed.createComponent(CorrectionOverlay);
    const source = ANNOTATION_IMAGE_FIXTURES[0];
    const box = { x: 10, y: 20, w: 15, h: 5 };
    for (const [key, value] of Object.entries({ imageUrl: source.url, fileId: 'f', submissionId: 's',
      sourceGeometry: { version: 1, fileId: 'f', pageNumber: 1, coordinateSpace: 'display-image', orientation: 1, width: source.width * 2, height: source.height * 2 },
      ocrWords: [{ id: 'w', text: 'blindely', bbox: box }],
      annotations: [{ _id: 'c', fileId: 'f', submissionId: 's', page: 1, symbol: 'SP', wordIds: ['w'],
        renderTarget: { version: 1, source: 'wordIds', wordIds: ['w'], anchors: [], boxes: [box] } }] })) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    await image.decode(); fixture.componentInstance.onImageLoad({ target: image } as unknown as Event); fixture.detectChanges();
    expect(fixture.componentInstance.markers).toHaveSize(0);
    expect(fixture.componentInstance.underlineSegments).toHaveSize(0);
    fixture.destroy();
  });
});
