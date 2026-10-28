import { TestBed } from '@angular/core/testing';
import { ImageCrop } from './image-crop';
import { cropImage, CropRect } from './image-crop.util';
import { CROP_SOURCE } from '../../../testing/fixtures/crop-source';

export function sourceFile(oriented = false): File {
  const bytes = Uint8Array.from(atob(oriented ? CROP_SOURCE.oriented : CROP_SOURCE.original), c => c.charCodeAt(0));
  return new File([bytes], oriented ? 'iphone.jpg' : 'essay.png', { type: oriented ? 'image/jpeg' : 'image/png' });
}

describe('ImageCrop local editing and encoding', () => {
  async function setup(oriented = false, initial?: CropRect) {
    await TestBed.configureTestingModule({ imports: [ImageCrop] }).compileComponents();
    const fixture = TestBed.createComponent(ImageCrop);
    fixture.componentRef.setInput('original', sourceFile(oriented));
    fixture.componentRef.setInput('initial', initial); fixture.detectChanges();
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    await image.decode(); fixture.componentInstance.onLoad(); fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, image };
  }
  it('encodes the chosen pixels as a correctly named lossless PNG, including iPhone EXIF orientation', async () => {
    for (const oriented of [false, true]) {
      const { fixture, image, component } = await setup(oriented);
      expect(image.naturalWidth).toBe(1000); expect(image.naturalHeight).toBe(800);
      const output = await cropImage(image, component.original, CROP_SOURCE.rect);
      expect(output.type).toBe('image/png'); expect(output.name).toMatch(/-cropped\.png$/);
      const url = URL.createObjectURL(output), preview = new Image(); preview.src = url;
      await preview.decode(); expect(preview.naturalWidth).toBe(800); expect(preview.naturalHeight).toBe(600);
      const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
      const context = canvas.getContext('2d')!; context.drawImage(preview, 0, 0);
      const pixel = context.getImageData(250, 250, 1, 1).data;
      expect(pixel[1]).toBeGreaterThan(pixel[0] + 50); expect(pixel[1]).toBeGreaterThan(pixel[2] + 50);
      URL.revokeObjectURL(url); fixture.destroy(); TestBed.resetTestingModule();
    }
  });
  it('rejects zero, tiny, invalid and oversized export dimensions without upscaling', async () => {
    const { fixture, image, component } = await setup();
    for (const rect of [{x:0,y:0,width:0,height:1}, {x:0,y:0,width:.01,height:.01},
      {x:NaN,y:0,width:1,height:1}, {x:.5,y:0,width:1,height:1}]) {
      await expectAsync(cropImage(image, component.original, rect)).toBeRejected();
    }
    Object.defineProperty(image, 'naturalWidth', { value: 10000 });
    Object.defineProperty(image, 'naturalHeight', { value: 10000 });
    await expectAsync(cropImage(image, component.original, {x:0,y:0,width:1,height:1})).toBeRejected();
    fixture.destroy();
  });
  it('supports touch drag, free-aspect resize and keyboard edge fields without emitting a file until Apply', async () => {
    const { fixture, component, image } = await setup();
    const applied = jasmine.createSpy(); component.applied.subscribe(applied);
    component.rect = {...CROP_SOURCE.rect}; fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.se') as HTMLButtonElement;
    spyOn(button, 'setPointerCapture');
    const bounds = image.getBoundingClientRect();
    button.dispatchEvent(new PointerEvent('pointerdown', {pointerId:1,button:0,clientX:100,clientY:100,pointerType:'touch'}));
    button.dispatchEvent(new PointerEvent('pointermove', {pointerId:1,clientX:100-bounds.width*.1,clientY:100}));
    button.dispatchEvent(new PointerEvent('pointerup', {pointerId:1}));
    expect(component.rect.width).toBeCloseTo(.7); expect(component.rect.height).toBe(.75);
    const field = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    field.value = '5'; field.dispatchEvent(new Event('input')); expect(component.rect.x).toBe(.05);
    expect(applied).not.toHaveBeenCalled();
    await component.apply(); expect(applied).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });
  it('releases its original URL and suppresses a late encode result after cancellation/destruction', async () => {
    const { fixture, component } = await setup();
    const revoke = spyOn(URL, 'revokeObjectURL').and.callThrough(), applied = jasmine.createSpy();
    component.applied.subscribe(applied); component.rect = {...CROP_SOURCE.rect};
    const pending = component.apply(); const url = component.url; fixture.destroy(); await pending;
    expect(applied).not.toHaveBeenCalled(); expect(revoke).toHaveBeenCalledWith(url);
  });
  it('keeps original selection intact if encoding fails or produces an oversized file', async () => {
    const { fixture, component } = await setup(); const original = component.original;
    spyOn(HTMLCanvasElement.prototype, 'toBlob').and.callFake(callback => callback(new Blob([new Uint8Array(10*1024*1024+1)], {type:'image/png'})));
    component.rect = {...CROP_SOURCE.rect}; await component.apply();
    expect(component.error).toContain('10MB'); expect(component.original).toBe(original); fixture.destroy();
  });
  it('reopens the saved original-relative crop in a narrow layout with keyboard controls', async () => {
    const { fixture, component } = await setup(false, CROP_SOURCE.rect);
    fixture.nativeElement.style.width = '320px'; fixture.detectChanges();
    expect(component.rect).toEqual(CROP_SOURCE.rect);
    const editor = fixture.nativeElement.querySelector('.editor') as HTMLElement;
    expect(editor.scrollWidth).toBeLessThanOrEqual(editor.clientWidth);
    expect(fixture.nativeElement.querySelectorAll('label input').length).toBe(4);
    const enter = new KeyboardEvent('keydown', {key:'Enter',bubbles:true,cancelable:true});
    fixture.nativeElement.querySelector('input').dispatchEvent(enter);
    expect(enter.defaultPrevented).toBeTrue(); fixture.destroy();
  });
  it('refuses editing above the decoded-image safety limit without changing the original file', async () => {
    const { fixture, component, image } = await setup(); const original = component.original;
    Object.defineProperty(image, 'naturalWidth', {value:8192});
    Object.defineProperty(image, 'naturalHeight', {value:8192}); component.onLoad();
    expect(component.loaded).toBeFalse(); expect(component.error).toContain('too large');
    expect(component.original).toBe(original); fixture.destroy();
  });
});
