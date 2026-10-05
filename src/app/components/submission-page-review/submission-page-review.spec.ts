import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { SubmissionPageReview } from './submission-page-review';
import { CorrectionOverlay } from '../correction-overlay/correction-overlay';
import { buildTranscriptPageViews } from '../../utils/transcript-page-views.util';

describe('shared PDF page review', () => {
  let fixture: ComponentFixture<SubmissionPageReview>;
  let http: HttpTestingController;
  const urls = [1, 2].map(n => `/files/submissions/00000000-0000-0000-0000-00000000000${n}.jpg`);
  const pages = () => buildTranscriptPageViews({ submissionId: 's', fileIds: ['pdf'], overallOcrStatus: 'completed',
    ocrPages: urls.map((pageImageUrl, i) => ({ fileId: 'pdf', pageNumber: i + 1, pageImageUrl, width: 1653, height: 2339,
      words: [{ id: `w${i}`, text: 'word', bbox: { x: 10, y: 10, w: 10, h: 2 } }] })),
    corrections: urls.map((_, i) => ({ id: `c${i}`, fileId: 'pdf', pageNumber: i + 1, wordIds: [`w${i}`], symbol: 'AGR' })) });
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SubmissionPageReview], providers: [provideHttpClient(), provideHttpClientTesting()] }).compileComponents();
    fixture = TestBed.createComponent(SubmissionPageReview); http = TestBed.inject(HttpTestingController);
    spyOn(URL, 'createObjectURL').and.returnValues('blob:page1', 'blob:page2'); spyOn(URL, 'revokeObjectURL');
  });
  afterEach(() => { fixture.destroy(); http.verify(); });
  it('lazily fetches one authenticated page and switches image, words, and scoped corrections together', () => {
    fixture.componentRef.setInput('pages', pages()); fixture.detectChanges();
    expect(fixture.componentInstance.loading).toBeTrue();
    http.expectOne(req => req.url.endsWith(urls[0])).flush(new Blob(['one'], { type: 'image/jpeg' })); fixture.detectChanges();
    let overlay = fixture.debugElement.query(By.directive(CorrectionOverlay)).componentInstance as CorrectionOverlay;
    expect(overlay.page).toBe(1); expect(overlay.annotations?.map(a => a._id)).toEqual(['c0']);
    expect(fixture.nativeElement.textContent).toContain('Page 1 of 2');
    fixture.componentInstance.select(1); fixture.detectChanges();
    expect(fixture.componentInstance.imageUrl).toBeNull(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:page1');
    http.expectOne(req => req.url.endsWith(urls[1])).flush(new Blob(['two'], { type: 'image/jpeg' })); fixture.detectChanges();
    overlay = fixture.debugElement.query(By.directive(CorrectionOverlay)).componentInstance as CorrectionOverlay;
    expect(overlay.imageUrl).toBe('blob:page2'); expect(overlay.page).toBe(2);
    expect(overlay.annotations?.map(a => a._id)).toEqual(['c1']); expect(overlay.ocrWords?.map(w => w.id)).toEqual(['w1']);
  });
  it('shows a fetch failure and retries without triggering OCR', () => {
    fixture.componentRef.setInput('pages', pages()); fixture.detectChanges();
    http.expectOne(req => req.url.endsWith(urls[0])).flush(new Blob(['failed']), { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges(); expect(fixture.componentInstance.failed).toBeTrue();
    fixture.componentInstance.load(); http.expectOne(req => req.url.endsWith(urls[0])).flush(new Blob(['one']));
    expect(fixture.componentInstance.failed).toBeFalse(); expect(fixture.componentInstance.loading).toBeFalse();
  });
  it('cancels stale page requests on navigation and rejects external asset URLs', () => {
    fixture.componentRef.setInput('pages', pages()); fixture.detectChanges();
    const first = http.expectOne(req => req.url.endsWith(urls[0]));
    fixture.componentInstance.select(1); expect(first.cancelled).toBeTrue();
    http.expectOne(req => req.url.endsWith(urls[1])).flush(new Blob(['two']));
    fixture.componentRef.setInput('pages', [{ ...pages()[0], imageUrl: 'https://untrusted.test/page.jpg' }]); fixture.detectChanges();
    expect(fixture.componentInstance.failed).toBeTrue();
    http.expectNone('https://untrusted.test/page.jpg');
  });
});
