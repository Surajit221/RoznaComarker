import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SpeakingTranscript } from './speaking-transcript';
import { WritingCorrectionsApiService } from '../../../api/writing-corrections-api.service';
import type { SpeakingResult } from '../../../api/speaking-api.service';
import { TokenizedTranscript } from '../../submission-details/tokenized-transcript/tokenized-transcript';

const LEGEND = { version: 'v1', groups: ['CONTENT', 'ORGANIZATION', 'GRAMMAR', 'VOCABULARY', 'MECHANICS'].map(key => ({ key, label: key, symbols: [{ symbol: key[0], label: key }] })) };
const result = (over: Partial<SpeakingResult> = {}): SpeakingResult => ({ submissionId: 's1', state: 'ready', reason: null, marksVisible: true,
  assessedText: 'My town have a river.', fluency: null, fillers: [{ offset: 0, text: 'Um,' }], result: null,
  corrections: [{ id: 'c1', category: 'GRAMMAR', symbol: 'AGR', quotedText: 'town have', startChar: 3, endChar: 12, message: 'Use has with town.', suggestedText: 'town has' }],
  ...over });

describe('SpeakingTranscript', () => {
  let fixture: ComponentFixture<SpeakingTranscript>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SpeakingTranscript],
      providers: [{ provide: WritingCorrectionsApiService, useValue: { getLegend: () => Promise.resolve(LEGEND) } }] }).compileComponents();
    fixture = TestBed.createComponent(SpeakingTranscript);
    fixture.componentRef.setInput('result', result());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });
  const root = () => fixture.nativeElement as HTMLElement;
  const transcript = () => fixture.debugElement.query(el => el.componentInstance instanceof TokenizedTranscript).componentInstance as TokenizedTranscript;

  it('the transcript is a labelled region using the existing transcript component, with highlights from the corrections', () => {
    expect(root().querySelector('[role=region]')!.getAttribute('aria-label')).toBe('Transcript');
    expect(transcript().ocrWords!.map(w => w.text)).toEqual(['My', 'town', 'have', 'a', 'river.']);
    expect(transcript().annotations!.length).toBe(1);
    expect(root().querySelectorAll('.correction-highlight').length).toBe(2);
  });

  it('every correction is also in a plain list (not only colour), with quote, suggestion and message', () => {
    const item = root().querySelector('[data-speaking-corrections] li')!;
    expect(item.textContent).toContain('town have');
    expect(item.textContent).toContain('town has');
    expect(item.textContent).toContain('Use has with town.');
    expect(item.textContent).toContain('Grammar');
  });

  it('a labelled checkbox shows the filler words in brackets', () => {
    const box = root().querySelector<HTMLInputElement>('input[type=checkbox]')!;
    expect(box.closest('label')!.textContent).toContain('Show filler words');
    expect(transcript().ocrWords!.some(w => w.text === '(um)')).toBeFalse();
    box.click();
    fixture.detectChanges();
    expect(transcript().ocrWords![0].text).toBe('(um)');
    expect(root().textContent).toContain('Filler words are shown in brackets');
  });

  it('no fillers: no checkbox; the legend shows only Grammar and Vocabulary (the categories marked for speech)', () => {
    fixture.componentRef.setInput('result', result({ fillers: [] }));
    fixture.detectChanges();
    expect(root().querySelector('input[type=checkbox]')).toBeNull();
    const keys = (fixture.componentInstance.legend?.groups ?? []).map(g => g.key);
    expect(keys).toEqual(['GRAMMAR', 'VOCABULARY']);
  });
});
