// Stage 7f addendum: the plain list groups identical corrections (one row with a count); the transcript keeps every highlight at its offset; the
// statistics count every occurrence, as the essay statistics do.
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SpeakingTranscript } from './speaking-transcript';
import { WritingCorrectionsApiService } from '../../../api/writing-corrections-api.service';
import type { SpeakingCorrection, SpeakingResult } from '../../../api/speaking-api.service';
import { TokenizedTranscript } from '../../submission-details/tokenized-transcript/tokenized-transcript';

const SENTENCE = 'The council builded a library. ';
const TEXT = SENTENCE.repeat(17).trim();
const corrections: SpeakingCorrection[] = Array.from({ length: 17 }, (_, i) => ({ id: `b${i}`, category: 'GRAMMAR', symbol: 'VF', quotedText: 'builded',
  startChar: i * SENTENCE.length + 12, endChar: i * SENTENCE.length + 19, message: 'Built is the past form.', suggestedText: 'built' }));
const result = (): SpeakingResult => ({ submissionId: 's1', state: 'ready', reason: null, marksVisible: true, assessedText: TEXT, fluency: null, fillers: [],
  result: null, corrections });

describe('SpeakingTranscript: grouped corrections and statistics', () => {
  let fixture: ComponentFixture<SpeakingTranscript>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SpeakingTranscript],
      providers: [{ provide: WritingCorrectionsApiService, useValue: { getLegend: () => Promise.resolve({ version: 'v', groups: [] }) } }] }).compileComponents();
    fixture = TestBed.createComponent(SpeakingTranscript);
    fixture.componentRef.setInput('result', result());
    fixture.detectChanges();
  });
  const root = () => fixture.nativeElement as HTMLElement;

  it('one list row for the 17 identical corrections, with the count visible and read out', () => {
    const rows = root().querySelectorAll('[data-speaking-corrections] li');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('builded');
    expect(rows[0].textContent).toContain('built');
    expect(rows[0].textContent).toContain('×17');
    expect(rows[0].querySelector('.sr-only')!.textContent).toContain('17 times');
    expect(root().querySelector('[data-speaking-corrections-heading]')!.textContent!.trim()).toBe('Corrections (17)');
  });

  it('the transcript still highlights all 17 places, each focusable on its own', () => {
    const transcript = fixture.debugElement.query(el => el.componentInstance instanceof TokenizedTranscript).componentInstance as TokenizedTranscript;
    expect(transcript.annotations!.length).toBe(17);
    const highlights = root().querySelectorAll('.correction-highlight');
    expect(highlights.length).toBe(17);
    expect([...highlights].every(el => el.getAttribute('tabindex') === '0')).toBeTrue();
  });

  it('the statistics count every occurrence (17), with the code breakdown, the same total as the list heading', () => {
    const grammar = root().querySelector('[data-statistic="grammar"]')!;
    expect(grammar.querySelector('[data-statistic-value]')!.textContent!.trim()).toBe('17');
    expect(grammar.textContent).toContain('VF 17');
    expect(root().querySelector('[data-statistic="vocabulary"] [data-statistic-value]')!.textContent!.trim()).toBe('0');
  });
});
