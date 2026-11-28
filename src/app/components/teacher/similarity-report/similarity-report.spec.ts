import { TestBed, fakeAsync, flushMicrotasks, tick, type ComponentFixture } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { SimilarityReportPanel } from './similarity-report';
import { SimilarityText } from './similarity-text';
import type { SimilarityReport, SimilaritySource } from '../../../api/similarity-api.service';
import { httpTestingProviders } from '../../../../testing/standalone-test-providers';

const API = 'http://localhost:5000/api/similarity/submissions/sub1';
const TEXT = 'alpha beta gamma delta epsilon zeta eta theta iota kappa';
const PANEL = { state: 'none', eligible: true, reason: null, wordCount: 10, checksLeftToday: 19, checksLeftForSubmission: 3, externalAvailable: true, noticeShown: true, confirmationNeeded: false };
const src = (over: Partial<SimilaritySource>): SimilaritySource => ({ sourceId: 's1', number: 1, kind: 'web', label: 'Internet source', percent: 20, words: 2,
  excluded: false, compared: true, ...over });
function report(over: Partial<SimilarityReport> = {}): SimilarityReport {
  return { ...PANEL, state: 'completed', revision: 4, checkedAt: '2026-11-27T10:00:00Z', outdated: false, text: TEXT, totalWords: 10, matchedWords: 3,
    overallPercent: 30, external: { state: 'completed', reason: null }, settings: { excludeQuotes: true, minMatchWords: 8 },
    audit: { provider: null, units: null, costUsd: null, resultCount: null },
    highlights: [{ start: 0, end: 10, sourceId: 's1' }, { start: 11, end: 16, sourceId: 's2' }],
    sources: [src({ title: 'Page <b>one</b>', url: 'https://example.test/one', viewUrl: 'https://view.example.test/c/1', spans: [{ start: 0, end: 10 }] }),
      src({ sourceId: 's2', number: 2, kind: 'internal', label: 'Another submission in Rubrilo', percent: 10, words: 1, spans: [{ start: 11, end: 16 }],
        open: { studentId: 'st1', classId: 'c1', assignmentId: 'a1', submissionId: 'x1' } }),
      src({ sourceId: 's3', number: null, kind: 'internal', label: 'Another submission in Rubrilo', percent: 0, words: 0 }),
      src({ sourceId: 's4', number: null, kind: 'web', title: 'Found page', percent: null, words: 0, compared: false, approxWords: 9 })],
    ...over } as SimilarityReport;
}

describe('SimilarityReportPanel', () => {
  let fixture: ComponentFixture<SimilarityReportPanel>;
  let http: HttpTestingController;
  const text = () => (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';
  const q = <T extends Element = HTMLElement>(sel: string) => (fixture.nativeElement as HTMLElement).querySelector(sel) as T | null;
  const qa = (sel: string) => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(sel));
  const button = (label: string) => qa('button').find(b => b.textContent?.trim().startsWith(label)) as HTMLButtonElement | undefined;
  const live = () => q('[aria-live="polite"]')?.textContent?.trim() ?? '';

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SimilarityReportPanel], providers: [...httpTestingProviders, provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SimilarityReportPanel);
  });
  afterEach(() => { fixture.destroy(); http.verify(); });

  function load(data: unknown, status = 200) {
    fixture.componentInstance.submissionId = 'sub1';
    fixture.detectChanges();
    const req = http.expectOne(API);
    if (status === 200) req.flush({ success: true, data }); else req.flush({ success: false, code: 'NOT_FOUND' }, { status, statusText: 'x' });
    flushMicrotasks();
    fixture.detectChanges();
  }

  it('its hidden live region is positioned inside the panel, never against the page (it would stretch the document: a second scrollbar)', fakeAsync(() => {
    document.body.appendChild(fixture.nativeElement);
    load(report());
    const live = q('[aria-live="polite"]')!;
    expect(getComputedStyle(live).position).toBe('absolute');
    expect(live.offsetParent).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).contains(live.offsetParent)).toBeTrue();
    (fixture.nativeElement as HTMLElement).remove();
  }));

  it('passages are shown as flowing text (a line break inside a paragraph is a space)', fakeAsync(() => {
    load(report({ text: 'alpha beta\ngamma delta epsilon zeta eta theta iota kappa', highlights: [], sources: [src({ spans: [{ start: 0, end: 16 }] })] }));
    expect(fixture.componentInstance.passages(fixture.componentInstance.report!.sources[0])).toEqual(['alpha beta gamma']);
  }));

  it('shows nothing at all when the server answers 404 (feature off, or not the owner)', fakeAsync(() => {
    load(null, 404);
    expect(q('section')).toBeNull();
  }));

  it('before a check: what will be compared, the checks left, and a check that polls until the report is ready', fakeAsync(() => {
    load(PANEL);
    expect(text()).toContain('sent to an external similarity-checking service');
    expect(text()).toContain('19 checks left today · 3 left for this essay');
    button('Check similarity')!.click();
    const post = http.expectOne(`${API}/checks`);
    expect(post.request.method).toBe('POST');
    expect(post.request.headers.get('Idempotency-Key')).toMatch(/^sim_[a-f0-9]{32}$/);
    post.flush({ success: true, data: { ...PANEL, state: 'queued', checksLeftToday: 18 } });
    flushMicrotasks(); fixture.detectChanges();
    expect(text()).toContain('Checking similarity…');
    expect(button('Check similarity')).toBeUndefined();
    tick(4000);
    http.expectOne(API).flush({ success: true, data: report() });
    flushMicrotasks(); fixture.detectChanges();
    expect(text()).toContain('30% of the essay matches other text');
    expect(live()).toBe('Similarity check finished: 30% of the essay matches other text.');
    tick(10000);   // no more polling once complete
  }));

  describe('the permission confirmation (an essay without the notice, with an internet provider configured)', () => {
    const NEEDS = { ...PANEL, externalAvailable: false, noticeShown: false, confirmationNeeded: true };
    const box = () => q<HTMLInputElement>('input[name="similarity-permission"]');

    it('is shown only when needed', fakeAsync(() => {
      load({ ...PANEL, confirmationNeeded: false });
      expect(box()).toBeNull();
      fixture.componentInstance.submissionId = 'other';
      fixture.detectChanges();
      http.expectOne('http://localhost:5000/api/similarity/submissions/other').flush({ success: true, data: NEEDS });
      flushMicrotasks(); fixture.detectChanges();
      expect(box()).not.toBeNull();
      const label = box()!.closest('label')!.textContent!.replace(/\s+/g, ' ').trim();
      expect(label).toBe('I confirm I have permission to send this essay to an external similarity-checking service');
      expect(text()).toContain('Without your confirmation, this essay is compared with other essays in Rubrilo only.');
    }));

    it('not ticked: Check sends no confirmation (Rubrilo only)', fakeAsync(() => {
      load(NEEDS);
      button('Check similarity')!.click();
      const post = http.expectOne(`${API}/checks`);
      expect(post.request.body).toEqual({});
      post.flush({ success: true, data: { ...NEEDS, state: 'queued' } });
      flushMicrotasks(); fixture.destroy(); tick(4000);
    }));

    it('ticked, then Check: sends confirmPermission true; the tick is cleared afterwards', fakeAsync(() => {
      load(NEEDS);
      box()!.click(); fixture.detectChanges();
      expect(text()).not.toContain('Without your confirmation');
      button('Check similarity')!.click();
      const post = http.expectOne(`${API}/checks`);
      expect(post.request.body).toEqual({ confirmPermission: true });
      post.flush({ success: true, data: report({ ...NEEDS, state: 'completed' } as Partial<SimilarityReport>) });
      flushMicrotasks(); fixture.detectChanges();
      expect(fixture.componentInstance.permissionConfirmed).toBeFalse();
      expect(box()!.checked).toBeFalse();
    }));

    it('is not shown while a check runs', fakeAsync(() => {
      load({ ...NEEDS, state: 'queued', revision: 1 });
      expect(box()).toBeNull();
      fixture.destroy(); tick(4000);
    }));
  });

  it('an essay before the notice, and an essay that cannot be checked, say why', fakeAsync(() => {
    load({ ...PANEL, externalAvailable: false, noticeShown: false });
    expect(text()).toContain('compared within Rubrilo only');
    fixture.componentInstance.submissionId = 'other';
    fixture.detectChanges();
    http.expectOne('http://localhost:5000/api/similarity/submissions/other').flush({ success: true, data: { ...PANEL, eligible: false, reason: 'transcript_not_confirmed' } });
    flushMicrotasks(); fixture.detectChanges();
    expect(text()).toContain('needs a confirmed transcript');
    expect(button('Check similarity')).toBeUndefined();
  }));

  it('the overview: numbered sources (number and colour), the not counted ones out of the list; text by interpolation', fakeAsync(() => {
    load(report());
    const rows = qa('ol.sources li');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('1');
    expect(rows[0].textContent).toContain('Internet source');
    expect(rows[0].textContent).toContain('20%');
    expect(rows[0].querySelector('.source__number')!.getAttribute('style')).toContain('background');
    expect(text()).toContain('Page <b>one</b>');
    expect(q('ol.sources b b')).toBeNull();
  }));

  it('selecting a source shows its matched text, its links as given, and lets the teacher exclude it; the change is announced', fakeAsync(() => {
    load(report());
    qa('ol.sources button')[0].click();
    fixture.detectChanges();
    expect(q('.detail')!.textContent).toContain('alpha beta');
    const links = qa('.detail a').map(a => a.getAttribute('href'));
    expect(links).toEqual(['https://example.test/one', 'https://view.example.test/c/1']);
    expect(qa('.detail a').every(a => a.getAttribute('rel') === 'noopener noreferrer')).toBeTrue();
    button('Exclude this source')!.click();
    const patch = http.expectOne(`${API}/sources/s1`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ excluded: true, revision: 4, requestId: jasmine.stringMatching(/^sim_/) });
    patch.flush({ success: true, data: report({ revision: 5, overallPercent: 10, matchedWords: 1, sources: report().sources.map(s => s.sourceId === 's1'
      ? { ...s, excluded: true, number: null, percent: null } : s.sourceId === 's2' ? { ...s, number: 1 } : s) }) });
    flushMicrotasks(); fixture.detectChanges();
    expect(live()).toBe('Source excluded. Similarity is now 10%.');
    expect(text()).toContain('10% of the essay matches other text');
  }));

  it('an own-class source opens the submission; another teacher\'s shows its percentage only', fakeAsync(() => {
    load(report());
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    qa('ol.sources button')[1].click();
    fixture.detectChanges();
    button('Open submission')!.click();
    expect(navigate).toHaveBeenCalledWith(['/teacher/my-classes/detail/student-submissions', 'st1'], { queryParams: { classId: 'c1', assignmentId: 'a1', submissionId: 'x1' } });
    fixture.componentInstance.select('s3');
    fixture.detectChanges();
    expect(q('.detail')!.textContent).toContain('outside your classes');
    expect(button('Open submission')).toBeUndefined();
  }));

  it('All sources: tick and exclude several (each with the revision the last returned), the excluded list, restore one and restore all', fakeAsync(() => {
    load(report());
    button('All sources')!.click();
    fixture.detectChanges();
    expect(text()).toContain('Found but not compared (about 9 words)');
    const boxes = qa('.all__row input[type=checkbox]') as HTMLInputElement[];
    boxes[0].click(); boxes[1].click();
    fixture.detectChanges();
    button('Exclude selected (2)')!.click();
    const first = http.expectOne(`${API}/sources/s1`);
    expect(first.request.body.revision).toBe(4);
    first.flush({ success: true, data: report({ revision: 5 }) });
    flushMicrotasks();
    const second = http.expectOne(`${API}/sources/s2`);
    expect(second.request.body.revision).toBe(5);
    const both = report({ revision: 6, overallPercent: 0, matchedWords: 0, sources: report().sources.map(s => ['s1', 's2'].includes(s.sourceId) ? { ...s, excluded: true, number: null, percent: null } : s) });
    second.flush({ success: true, data: both });
    flushMicrotasks(); fixture.detectChanges();
    expect(live()).toBe('2 sources excluded. Similarity is now 0%.');
    expect(text()).toContain('Excluded (2)');
    button('Restore all')!.click();
    const all = http.expectOne(`${API}/sources/restore-all`);
    expect(all.request.body).toEqual({ revision: 6, requestId: jasmine.stringMatching(/^sim_/) });
    all.flush({ success: true, data: report({ revision: 7 }) });
    flushMicrotasks(); fixture.detectChanges();
    expect(live()).toBe('All sources restored. Similarity is now 30%.');
  }));

  it('a revision conflict reloads the report from the answer and says so', fakeAsync(() => {
    load(report());
    qa('ol.sources button')[0].click(); fixture.detectChanges();
    button('Exclude this source')!.click();
    http.expectOne(`${API}/sources/s1`).flush({ success: false, code: 'SIMILARITY_REVISION_CONFLICT', data: report({ revision: 9, overallPercent: 20 }) },
      { status: 409, statusText: 'Conflict' });
    flushMicrotasks(); fixture.detectChanges();
    expect(fixture.componentInstance.report!.revision).toBe(9);
    expect(live()).toBe('This report changed and has been reloaded.');
    expect(q('[role="alert"]')).toBeNull();
  }));

  it('outdated, the external notes, the daily cap, and trying the internet check again', fakeAsync(() => {
    load(report({ outdated: true, external: { state: 'failed', reason: 'service_unavailable' }, checksLeftToday: 0 }));
    expect(text()).toContain('The essay changed after this check');
    expect(text()).toContain('The internet check is unavailable right now');
    expect(button('Check again')).toBeUndefined();
    button('Try the internet check again')!.click();
    const retry = http.expectOne(`${API}/checks/retry`);
    expect(retry.request.headers.get('Idempotency-Key')).toMatch(/^sim_/);
    retry.flush({ success: true, data: { ...report(), state: 'queued' } });
    flushMicrotasks(); fixture.detectChanges();
    expect(text()).toContain('Checking similarity…');
    fixture.destroy();
    tick(4000);
  }));

  it('a report that is still queued or running shows only the progress, never a (still empty) result', fakeAsync(() => {
    load(report({ state: 'running', sources: [], highlights: [], overallPercent: 0, matchedWords: 0 }));
    expect(text()).toContain('Checking similarity…');
    expect(text()).not.toContain('of the essay matches other text');
    expect(q('.layout')).toBeNull();
    fixture.destroy();
    tick(4000);
  }));

  it('submitted: the Rubrilo result is shown while the internet check runs', fakeAsync(() => {
    load(report({ state: 'submitted', external: { state: 'submitted', reason: null } }));
    expect(text()).toContain('Waiting for the internet check');
    expect(text()).toContain('30% of the essay matches other text');
    fixture.destroy();
    tick(4000);
  }));

  it('a cap answer is shown as its fixed message', fakeAsync(() => {
    load(PANEL);
    button('Check similarity')!.click();
    http.expectOne(`${API}/checks`).flush({ success: false, code: 'SIMILARITY_DAILY_CAP' }, { status: 429, statusText: 'Too Many' });
    flushMicrotasks(); fixture.detectChanges();
    expect(q('[role="alert"]')!.textContent).toContain('used all of today');
  }));

  it('Show highlights can be turned off', fakeAsync(() => {
    load(report());
    expect(qa('mark').length).toBe(2);
    const toggle = q<HTMLInputElement>('.toggle input')!;
    toggle.click(); fixture.detectChanges();
    expect(qa('mark').length).toBe(0);
  }));

  describe('own percentages with many overlapping sources (20 near-identical copies)', () => {
    const many = () => report({ overallPercent: 92, matchedWords: 9, totalWords: 10, highlights: [{ start: 0, end: 10, sourceId: 's1' }],
      sources: Array.from({ length: 20 }, (_, i) => src({ sourceId: `s${i + 1}`, number: i + 1, kind: 'internal', label: 'Another submission in Rubrilo',
        percent: i === 0 ? 92 : 90, words: 9, sameAs: i === 0 ? null : 1, alsoIn: i === 0 ? Array.from({ length: 19 }, (_, k) => k + 2) : [1],
        spans: [{ start: 0, end: 10 }] })) });
    const rows = () => qa('ol.sources li');

    it('shows each source\'s own percentage (never 0% for a source with words), "same text as source 1", and the overlap note', fakeAsync(() => {
      load(many());
      expect(text()).toContain('Overall counts each word once; sources can overlap.');
      expect(rows()[0].textContent).toContain('92%');
      expect(rows()[1].textContent).toContain('90%');
      expect(rows()[1].textContent).toContain('same text as source 1');
      expect(rows()[0].textContent).not.toContain('same text as');
      expect(rows().some(r => /(^|\D)0%/.test(r.textContent || ''))).toBeFalse();
    }));

    it('top 5 by own percentage, then "Show all (20)" / "Show top 5", announced for screen readers', fakeAsync(() => {
      load(many());
      expect(rows().length).toBe(5);
      expect(rows().map(r => r.querySelector('.source__number')!.textContent!.trim())).toEqual(['1', '2', '3', '4', '5']);
      const more = button('Show all (20)')!;
      expect(more.getAttribute('aria-expanded')).toBe('false');
      more.click(); fixture.detectChanges();
      expect(rows().length).toBe(20);
      expect(live()).toBe('Showing all 20 sources.');
      expect(button('Show top 5')!.getAttribute('aria-expanded')).toBe('true');
      button('Show top 5')!.click(); fixture.detectChanges();
      expect(rows().length).toBe(5);
      expect(live()).toBe('Showing the top 5 of 20 sources.');
    }));

    it('five sources or fewer: no Show all control', fakeAsync(() => {
      load(report());
      expect(button('Show all')).toBeUndefined();
    }));

    it('the popup says which other sources share the passage; a source shown after Show all can be excluded', fakeAsync(() => {
      load(many());
      qa('ol.sources button')[0].click(); fixture.detectChanges();
      expect(q('.detail')!.textContent).toContain('Also in sources 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20');
      button('Show all (20)')!.click(); fixture.detectChanges();
      qa('ol.sources button')[19].click(); fixture.detectChanges();
      expect(q('.detail')!.textContent).toContain('Also in source 1');
      expect(q('.detail')!.textContent).toContain('same text as source 1');
      button('Exclude this source')!.click();
      const patch = http.expectOne(`${API}/sources/s20`);
      expect(patch.request.body).toEqual({ excluded: true, revision: 4, requestId: jasmine.stringMatching(/^sim_/) });
      patch.flush({ success: true, data: many() });
      flushMicrotasks(); fixture.detectChanges();
    }));

    it('All sources: Exclude selected works for every source, including those past the top 5', fakeAsync(() => {
      load(many());
      button('All sources')!.click(); fixture.detectChanges();
      const boxes = qa('.all__row input[type=checkbox]') as HTMLInputElement[];
      expect(boxes.length).toBe(20);
      boxes[19].click(); fixture.detectChanges();
      button('Exclude selected (1)')!.click();
      const patch = http.expectOne(`${API}/sources/s20`);
      patch.flush({ success: true, data: many() });
      flushMicrotasks(); fixture.detectChanges();
      expect(live()).toContain('1 source excluded.');
    }));
  });
});

describe('SimilarityText', () => {
  let fixture: ComponentFixture<SimilarityText>;
  beforeEach(() => { TestBed.configureTestingModule({ imports: [SimilarityText] }); fixture = TestBed.createComponent(SimilarityText); });
  function render(text: string, highlights: { start: number; end: number; sourceId: string }[], sources: SimilaritySource[]) {
    fixture.componentRef.setInput('text', text);
    fixture.componentRef.setInput('highlights', highlights);
    fixture.componentRef.setInput('sources', sources);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('each highlight shows its number as text, is a keyboard button with a label, and selects its source', () => {
    const el = render('one two three', [{ start: 4, end: 7, sourceId: 's1' }], [src({})]);
    const mark = el.querySelector('mark')!;
    expect(mark.textContent).toBe('two1');
    expect(mark.getAttribute('tabindex')).toBe('0');
    expect(mark.getAttribute('role')).toBe('button');
    expect(mark.getAttribute('aria-label')).toBe('Source 1, Internet source, 20%');
    const seen: string[] = [];
    fixture.componentInstance.selectSource.subscribe((id: string) => seen.push(id));
    mark.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    mark.click();
    expect(seen).toEqual(['s1', 's1']);
    expect(el.textContent).toBe('one two1 three');
  });
  it('text stays text (no HTML), a highlight of a source without a number is not marked, page breaks are dropped', () => {
    const el = render('<b>x</b> y\fz', [{ start: 0, end: 8, sourceId: 's9' }], [src({ sourceId: 's9', number: null })]);
    expect(el.querySelector('b')).toBeNull();
    expect(el.querySelector('mark')).toBeNull();
    expect(el.textContent).toBe('<b>x</b> yz');
  });
  it('line breaks inside a paragraph flow as spaces; paragraph breaks stay; highlights keep their words', () => {
    const el = render('one two\nthree four\n\nfive', [{ start: 4, end: 13, sourceId: 's1' }], [src({})]);
    expect(el.textContent).toBe('one two three1 four\n\nfive');
    expect(el.querySelector('mark')!.textContent).toBe('two three1');
  });
  it('positions after a page break still land on the right words', () => {
    const el = render('ab\fcd ef', [{ start: 3, end: 5, sourceId: 's1' }], [src({})]);
    expect(el.querySelector('mark')!.textContent).toBe('cd1');
  });
});
