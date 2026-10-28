import { TestBed } from '@angular/core/testing';
import { CorrectionOverlay } from './correction-overlay';
import { correctionGeometryTargets } from '../../utils/correction-bbox.util';
import { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import { cropImage } from '../image-crop/image-crop.util';
import { CROP_SOURCE } from '../../../testing/fixtures/crop-source';

describe('Cropped source annotation coordinates', () => {
  it('keeps a known ink target under its existing annotation at mobile and desktop sizes without original offsets', async () => {
    const original = new File([Uint8Array.from(atob(CROP_SOURCE.original), c => c.charCodeAt(0))], 'page.png', {type:'image/png'});
    const originalUrl = URL.createObjectURL(original), source = new Image(); source.src = originalUrl; await source.decode();
    const cropped = await cropImage(source,original,CROP_SOURCE.rect), url = URL.createObjectURL(cropped);
    await TestBed.configureTestingModule({imports:[CorrectionOverlay]}).compileComponents();
    const fixture = TestBed.createComponent(CorrectionOverlay);
    try {
      const box = CROP_SOURCE.expected.box;
      const annotation: FeedbackAnnotation = {_id:'crop-target',submissionId:'s',fileId:'f',page:1,symbol:'SP',category:'MECHANICS',
        source:'AI',editable:false,wordIds:['target'],message:'Fixture',confidence:1,bboxList:[box],
        renderTarget:{version:1,source:'visualTarget',wordIds:['target'],anchors:[],boxes:[box]}};
      fixture.componentRef.setInput('fileId','f'); fixture.componentRef.setInput('submissionId','s');
      fixture.componentRef.setInput('ocrWords',[{id:'target',text:'target',bbox:box}]);
      fixture.componentRef.setInput('annotations',[{...annotation,...correctionGeometryTargets(annotation)}]);
      fixture.componentRef.setInput('sourceGeometry',{version:1,fileId:'f',pageNumber:1,width:800,height:600,orientation:1,coordinateSpace:'display-image',ambiguous:false});
      fixture.componentRef.setInput('imageUrl',url);
      for (const width of [320, 1024]) {
        fixture.nativeElement.style.width = width + 'px'; fixture.detectChanges();
        const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
        await image.decode(); fixture.componentInstance.onImageLoad({target:image} as unknown as Event); fixture.detectChanges();
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        expect(image.naturalWidth).toBe(800); expect(image.naturalHeight).toBe(600);
        const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
        const context = canvas.getContext('2d')!; context.drawImage(image,0,0);
        expect(context.getImageData(250,250,1,1).data[1]).toBe(128);
        const segment = fixture.componentInstance.underlineSegments[0];
        expect(segment.left).toBeCloseTo(25,0); expect(segment.top).toBeGreaterThanOrEqual(49);
        const line = fixture.nativeElement.querySelector('.correction-overlay__underline').getBoundingClientRect();
        const displayed = image.getBoundingClientRect();
        expect(Math.abs(line.left-displayed.left-segment.left*displayed.width/100)).toBeLessThan(1);
        expect(Math.abs(line.top-displayed.top-segment.top*displayed.height/100)).toBeLessThan(1);
      }
    } finally { fixture.destroy(); URL.revokeObjectURL(originalUrl); URL.revokeObjectURL(url); }
  });
});
