import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { SimilarityNotice } from './similarity-notice';
import { SimilarityNoticeService } from '../../services/similarity-notice.service';
import { httpTestingProviders } from '../../../testing/standalone-test-providers';

const NOTICE_URL = 'http://localhost:5000/api/similarity/notice';

describe('SimilarityNotice and SimilarityNoticeService', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SimilarityNotice], providers: [...httpTestingProviders] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('shows the line (as text) and marks its version as shown; the upload form then carries it', fakeAsync(() => {
    const fixture = TestBed.createComponent(SimilarityNotice);
    fixture.detectChanges();
    http.expectOne(NOTICE_URL).flush({ success: true, data: { version: 'essay-similarity-2026-11', text: 'Your teacher may check <i>your</i> essay.' } });
    flushMicrotasks(); fixture.detectChanges();
    const note = (fixture.nativeElement as HTMLElement).querySelector('[role="note"]')!;
    expect(note.textContent).toContain('Your teacher may check <i>your</i> essay.');
    expect(note.querySelector('i')).toBeNull();
    const service = TestBed.inject(SimilarityNoticeService);
    expect(service.shownVersion).toBe('essay-similarity-2026-11');
    const form = new FormData();
    service.appendTo(form);
    expect(form.get('similarityNoticeVersion')).toBe('essay-similarity-2026-11');
    // loaded once for every form on the page
    TestBed.createComponent(SimilarityNotice).detectChanges();
    http.expectNone(NOTICE_URL);
  }));

  it('nothing while the feature is off; nothing is added to the upload', fakeAsync(() => {
    const fixture = TestBed.createComponent(SimilarityNotice);
    fixture.detectChanges();
    http.expectOne(NOTICE_URL).flush({}, { status: 404, statusText: 'Not Found' });
    flushMicrotasks(); fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="note"]')).toBeNull();
    const form = new FormData();
    TestBed.inject(SimilarityNoticeService).appendTo(form);
    expect(form.has('similarityNoticeVersion')).toBeFalse();
  }));
});
