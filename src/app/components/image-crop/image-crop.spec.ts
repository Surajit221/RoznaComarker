import { TestBed } from '@angular/core/testing';
import { ImageCrop } from './image-crop';
import {
  compressOversizedOriginal, cropImage, CropRect, DEFAULT_EXPORT_LIMITS, EXPORT_MIN_LONG_EDGE, EXPORT_MIN_SHORT_EDGE,
  JPEG_MIN_QUALITY, JPEG_START_QUALITY, UPLOAD_MAX_BYTES,
} from './image-crop.util';
import { CROP_SOURCE } from '../../../testing/fixtures/crop-source';

// Readability evidence (documented check): the automated "handwriting" test below uses a synthetic
// pen-on-paper image because no real student work may be committed. Real-photo validation is a manual
// step: crop a full-resolution phone photo of handwriting and compare the output at 100% zoom with
// the original (see the Step 1 report). Output must stay legible at JPEG quality >= JPEG_MIN_QUALITY.

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
  it('encodes the chosen pixels as a correctly named JPEG, including iPhone EXIF orientation', async () => {
    for (const oriented of [false, true]) {
      const { fixture, image, component } = await setup(oriented);
      expect(image.naturalWidth).toBe(1000); expect(image.naturalHeight).toBe(800);
      const output = await cropImage(image, component.original, CROP_SOURCE.rect);
      expect(output.type).toBe('image/jpeg'); expect(output.name).toMatch(/-cropped\.jpg$/);
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
  it('keeps original selection intact if even maximum compression cannot fit the limit', async () => {
    const { fixture, component } = await setup(); const original = component.original;
    spyOn(HTMLCanvasElement.prototype, 'toBlob').and.callFake(callback => callback(new Blob([new Uint8Array(UPLOAD_MAX_BYTES+1)], {type:'image/jpeg'})));
    component.rect = {...CROP_SOURCE.rect}; await component.apply();
    expect(component.error).toContain('still too large after compression'); expect(component.error).not.toContain('smaller source image');
    expect(component.original).toBe(original); fixture.destroy();
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
  it('starts fresh, releasing the old preview URL, when the original image input changes (multi-image stepping)', async () => {
    const { fixture, component } = await setup(false, CROP_SOURCE.rect);
    const firstUrl = component.url, revoke = spyOn(URL, 'revokeObjectURL').and.callThrough();
    fixture.componentRef.setInput('original', sourceFile(true)); fixture.componentRef.setInput('initial', undefined); fixture.detectChanges();
    expect(component.url).not.toBe(firstUrl); expect(revoke).toHaveBeenCalledWith(firstUrl);
    expect(component.rect).toEqual({ x: 0, y: 0, width: 1, height: 1 }); expect(component.loaded).toBeFalse();
    fixture.destroy();
  });
  it('offers Use full image next to the primary button, hides Cancel on request, and Escape cancels', async () => {
    const { fixture, component } = await setup();
    fixture.componentRef.setInput('applyLabel', 'Crop & Continue'); fixture.componentRef.setInput('skipLabel', 'Use full image');
    fixture.componentRef.setInput('showCancel', false); fixture.componentRef.setInput('headingText', 'Image 1 of 3'); fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement, buttons = Array.from(host.querySelectorAll('.actions button')) as HTMLButtonElement[];
    expect(buttons.map(button => button.textContent?.trim())).toEqual(['Use full image', 'Crop & Continue']);
    expect(host.querySelector('h3')?.textContent).toBe('Image 1 of 3');
    const skipped = jasmine.createSpy('skipped'), cancelled = jasmine.createSpy('cancelled'), applied = jasmine.createSpy('applied');
    component.skipped.subscribe(skipped); component.cancelled.subscribe(cancelled); component.applied.subscribe(applied);
    buttons[0].click(); expect(skipped).toHaveBeenCalledTimes(1); expect(applied).not.toHaveBeenCalled();
    host.querySelector('section')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cancelled).toHaveBeenCalledTimes(1);
    component.disabled = true; host.querySelector('section')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cancelled).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });
  it('refuses editing above the decoded-image safety limit without changing the original file', async () => {
    const { fixture, component, image } = await setup(); const original = component.original;
    Object.defineProperty(image, 'naturalWidth', {value:8192});
    Object.defineProperty(image, 'naturalHeight', {value:8192}); component.onLoad();
    expect(component.loaded).toBeFalse(); expect(component.error).toContain('too large');
    expect(component.original).toBe(original); fixture.destroy();
  });
});

describe('ImageCrop export size limit for large phone photos', () => {
  const FULL: CropRect = { x: 0, y: 0, width: 1, height: 1 };
  const urls: string[] = [];
  let previousTimeout: number;
  // Generating and re-encoding multi-megapixel images is slow on CI; restore the default afterwards.
  beforeEach(() => { previousTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL; jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000; });
  afterEach(() => { jasmine.DEFAULT_TIMEOUT_INTERVAL = previousTimeout; urls.splice(0).forEach(url => URL.revokeObjectURL(url)); });

  /** Incompressible noise makes a worst-case "photo": heavy as PNG and as JPEG alike. */
  async function noisePhoto(width: number, height: number, name = 'phone.jpg', quality = 0.35) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d')!, data = context.createImageData(width, height);
    for (let offset = 0; offset < data.data.length; offset += 65536) crypto.getRandomValues(data.data.subarray(offset, offset + 65536));
    for (let i = 3; i < data.data.length; i += 4) data.data[i] = 255;
    context.putImageData(data, 0, 0);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/jpeg', quality));
    canvas.width = 0; canvas.height = 0;
    return loaded(new File([blob], name, { type: 'image/jpeg' }));
  }
  async function loaded(file: File) {
    const url = URL.createObjectURL(file); urls.push(url);
    const image = new Image(); image.src = url; await image.decode();
    return { file, image };
  }
  async function decode(file: File): Promise<HTMLImageElement> {
    const url = URL.createObjectURL(file); urls.push(url);
    const image = new Image(); image.src = url; await image.decode();
    return image;
  }
  function recordEncodes() {
    const calls: { width: number; height: number; quality: number }[] = [];
    const realToBlob = HTMLCanvasElement.prototype.toBlob;
    spyOn(HTMLCanvasElement.prototype, 'toBlob').and.callFake(function (this: HTMLCanvasElement, callback, type, quality) {
      calls.push({ width: this.width, height: this.height, quality: quality as number });
      return realToBlob.call(this, callback, type, quality);
    });
    return calls;
  }
  function alwaysOversized() {
    const calls: { width: number; height: number; quality: number }[] = [];
    const blob = new Blob([new Uint8Array(UPLOAD_MAX_BYTES + 1)], { type: 'image/jpeg' });
    spyOn(HTMLCanvasElement.prototype, 'toBlob').and.callFake(function (this: HTMLCanvasElement, callback, _type, quality) {
      calls.push({ width: this.width, height: this.height, quality: quality as number }); callback(blob);
    });
    return calls;
  }
  function pretendSize(image: HTMLImageElement, width: number, height: number) {
    Object.defineProperty(image, 'naturalWidth', { value: width });
    Object.defineProperty(image, 'naturalHeight', { value: height });
  }

  it('exports a 12MP phone-photo crop under 10MB as JPEG instead of failing with "too large"', async () => {
    const { file, image } = await noisePhoto(4000, 3000);
    const output = await cropImage(image, file, FULL);
    expect(output.type).toBe('image/jpeg'); expect(output.name).toMatch(/-cropped\.jpg$/);
    expect(output.size).toBeLessThanOrEqual(UPLOAD_MAX_BYTES);
    const result = await decode(output);
    expect(Math.max(result.naturalWidth, result.naturalHeight)).toBeGreaterThanOrEqual(EXPORT_MIN_LONG_EDGE);
    expect(Math.abs(result.naturalWidth / result.naturalHeight - 4 / 3)).toBeLessThan(0.01);
  });

  it('lowers resolution before quality, never below the 2000px floor or 0.85 quality', async () => {
    const { file, image } = await noisePhoto(4000, 3000);
    const calls = recordEncodes();
    // An unreachable target forces the full ladder: every resolution step, then every quality step.
    const output = await cropImage(image, file, FULL, { ...DEFAULT_EXPORT_LIMITS, targetBytes: 1 });
    expect(calls.length).toBeGreaterThan(2);
    for (const call of calls) {
      expect(call.quality).toBeGreaterThanOrEqual(JPEG_MIN_QUALITY - 1e-9);
      expect(Math.max(call.width, call.height)).toBeGreaterThanOrEqual(EXPORT_MIN_LONG_EDGE);
      expect(Math.min(call.width, call.height)).toBeGreaterThanOrEqual(EXPORT_MIN_SHORT_EDGE);
    }
    const floorWidth = Math.min(...calls.map(call => call.width));
    expect(floorWidth).toBe(EXPORT_MIN_LONG_EDGE);
    for (const call of calls.filter(c => c.quality < JPEG_START_QUALITY)) expect(call.width).toBe(floorWidth);
    const resolutionSteps = calls.filter(c => c.quality === JPEG_START_QUALITY);
    resolutionSteps.forEach((call, i) => { if (i) expect(call.width).toBeLessThan(resolutionSteps[i - 1].width); });
    expect(calls.at(-1)!.quality).toBe(JPEG_MIN_QUALITY);
    expect(output.size).toBeLessThanOrEqual(UPLOAD_MAX_BYTES);
  });

  it('keeps full resolution and the highest quality when the crop already fits', async () => {
    const { file, image } = await loaded(sourceFile());
    const calls = recordEncodes();
    const output = await cropImage(image, file, CROP_SOURCE.rect);
    expect(calls).toEqual([{ width: 800, height: 600, quality: JPEG_START_QUALITY }]);
    expect(output.size).toBeLessThan(UPLOAD_MAX_BYTES);
  });

  it('fails with an accurate message, and never shrinks below the floors, when nothing can fit', async () => {
    const { file, image } = await loaded(sourceFile()); pretendSize(image, 4000, 3000);
    const calls = alwaysOversized();
    await expectAsync(cropImage(image, file, FULL)).toBeRejectedWithError(/still too large after compression/);
    expect(Math.min(...calls.map(c => c.width))).toBe(EXPORT_MIN_LONG_EDGE);
    expect(Math.min(...calls.map(c => c.quality))).toBeCloseTo(JPEG_MIN_QUALITY, 5);
  });

  it('respects the 640x480 minimum for a thin strip while compressing', async () => {
    const { file, image } = await loaded(sourceFile()); pretendSize(image, 5000, 600);
    const calls = alwaysOversized();
    await expectAsync(cropImage(image, file, FULL)).toBeRejected();
    for (const call of calls) {
      expect(call.height).toBeGreaterThanOrEqual(EXPORT_MIN_SHORT_EDGE); expect(call.width).toBeGreaterThanOrEqual(640);
    }
    expect(Math.min(...calls.map(c => c.width))).toBe(4000); // floor scale 480/600 keeps 4000 x 480
  });

  it('never upscales a source that is already below the long-edge floor', async () => {
    const { file, image } = await loaded(sourceFile());
    const calls = alwaysOversized();
    await expectAsync(cropImage(image, file, FULL)).toBeRejected();
    for (const call of calls) { expect(call.width).toBe(1000); expect(call.height).toBe(800); }
  });

  it('flattens transparency onto white because JPEG has no alpha', async () => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 800;
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png'));
    const { file, image } = await loaded(new File([blob], 'clear.png', { type: 'image/png' }));
    const output = await cropImage(image, file, FULL);
    const result = await decode(output), probe = document.createElement('canvas'); probe.width = 1000; probe.height = 800;
    const context = probe.getContext('2d')!; context.drawImage(result, 0, 0);
    const [r, g, b] = context.getImageData(10, 10, 1, 1).data;
    expect(Math.min(r, g, b)).toBeGreaterThan(245);
  });

  it('compresses an uncropped original over 10MB through the same compressor', async () => {
    const { file } = await noisePhoto(4000, 3000, 'IMG 0001.jpg', 1);
    expect(file.size).toBeGreaterThan(UPLOAD_MAX_BYTES); // precondition: this really is oversized
    const output = await compressOversizedOriginal(file);
    expect(output).not.toBe(file); expect(output.type).toBe('image/jpeg'); expect(output.name).toBe('IMG_0001-compressed.jpg');
    expect(output.size).toBeLessThanOrEqual(UPLOAD_MAX_BYTES);
    const result = await decode(output);
    expect(Math.max(result.naturalWidth, result.naturalHeight)).toBeGreaterThanOrEqual(EXPORT_MIN_LONG_EDGE);
    expect(Math.abs(result.naturalWidth / result.naturalHeight - 4 / 3)).toBeLessThan(0.01);
  });

  it('returns originals within the limit, and non-images such as PDFs, untouched', async () => {
    const small = sourceFile(), pdf = new File([new Uint8Array(UPLOAD_MAX_BYTES + 1)], 'big.pdf', { type: 'application/pdf' });
    expect(await compressOversizedOriginal(small)).toBe(small);
    expect(await compressOversizedOriginal(pdf)).toBe(pdf);
  });

  it('reports an unreadable oversized original without throwing a raw decode error', async () => {
    const broken = new File([new Uint8Array(UPLOAD_MAX_BYTES + 1)], 'broken.jpg', { type: 'image/jpeg' });
    await expectAsync(compressOversizedOriginal(broken)).toBeRejectedWithError(/Unable to open this image/);
  });

  it('keeps pen strokes intact at the lowest allowed settings (synthetic handwriting)', async () => {
    const width = 3600, height = 2700, source = document.createElement('canvas'); source.width = width; source.height = height;
    const context = source.getContext('2d')!;
    context.fillStyle = '#f3eedd'; context.fillRect(0, 0, width, height);
    context.strokeStyle = '#b9c2cc'; context.lineWidth = 2;
    for (let y = 160; y < height; y += 150) { context.beginPath(); context.moveTo(80, y); context.lineTo(width - 80, y); context.stroke(); }
    context.strokeStyle = '#1b2a8c'; context.lineWidth = 6; context.lineCap = 'round'; context.lineJoin = 'round';
    for (let line = 0; line < 17; line++) {
      const base = 150 + line * 150; context.beginPath(); context.moveTo(120, base);
      for (let x = 120; x < width - 200; x += 45) context.quadraticCurveTo(x + 12, base - 55 - (x * 7 % 40), x + 28, base - 4 + (x * 13 % 18));
      context.stroke();
    }
    const grain = context.getImageData(0, 0, width, height);
    for (let i = 0; i < grain.data.length; i += 4) { const n = (Math.random() - 0.5) * 8; grain.data[i] += n; grain.data[i + 1] += n; grain.data[i + 2] += n; }
    context.putImageData(grain, 0, 0);
    const blob = await new Promise<Blob>(resolve => source.toBlob(b => resolve(b!), 'image/png'));
    const { file, image } = await loaded(new File([blob], 'handwriting.png', { type: 'image/png' }));
    source.width = 0; source.height = 0;

    // Force the worst case the compressor can produce: floor resolution at the minimum quality.
    const output = await cropImage(image, file, FULL, { ...DEFAULT_EXPORT_LIMITS, targetBytes: 1 });
    const result = await decode(output), w = result.naturalWidth, h = result.naturalHeight;
    expect(Math.max(w, h)).toBe(EXPORT_MIN_LONG_EDGE);
    const read = (draw: (c: CanvasRenderingContext2D) => void) => {
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const c = canvas.getContext('2d')!; c.imageSmoothingQuality = 'high'; draw(c); return c.getImageData(0, 0, w, h).data;
    };
    const reference = read(c => c.drawImage(image, 0, 0, width, height, 0, 0, w, h));
    const encoded = read(c => c.drawImage(result, 0, 0));
    let squared = 0, inkReference = 0, inkEncoded = 0;
    const luma = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    for (let i = 0; i < reference.length; i += 4) {
      const a = luma(reference, i), b = luma(encoded, i); squared += (a - b) ** 2;
      if (a < 110) inkReference++; if (b < 110) inkEncoded++;
    }
    const psnr = 10 * Math.log10(255 ** 2 / (squared / (reference.length / 4)));
    console.log(`handwriting readability check: PSNR ${psnr.toFixed(1)} dB, ink pixels ${inkEncoded}/${inkReference}`);
    expect(psnr).toBeGreaterThan(30);
    expect(inkEncoded / inkReference).toBeGreaterThan(0.9); expect(inkEncoded / inkReference).toBeLessThan(1.1);
  });
});
