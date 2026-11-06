import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritingModelApiService, WritingModelForStudent } from '../../../api/writing-model-api.service';
import { WritingModelCard } from './writing-model-card';

describe('WritingModelCard', () => {
  let fixture: ComponentFixture<WritingModelCard>;
  const dom = () => fixture.nativeElement as HTMLElement;
  async function render(answer: WritingModelForStudent | null | Error) {
    const api = { forSubmission: answer instanceof Error ? () => Promise.reject(answer) : () => Promise.resolve(answer) };
    await TestBed.configureTestingModule({ imports: [WritingModelCard], providers: [{ provide: WritingModelApiService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(WritingModelCard);
    fixture.componentRef.setInput('submissionId', 's1');
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  }
  const empty = () => dom().innerHTML.replace(/<!--.*?-->/g, '').trim();

  for (const [name, answer] of [['feature off (404)', null], ['not available', { available: false }], ['an error', new Error('offline')]] as const) {
    it(`${name}: nothing is rendered`, async () => {
      await render(answer as WritingModelForStudent | null | Error);
      expect(dom().querySelector('[data-writing-model-card]')).toBeNull();
      expect(empty()).toBe('');
    });
  }
  it('available: the card, labelled as a learning reference, with the text as plain text', async () => {
    await render({ available: true, text: 'Paragraph one.\n\nParagraph <b>two</b>.' });
    const card = dom().querySelector('[data-writing-model-card]')!;
    expect(card.querySelector('h2')!.textContent).toBe('Improved Writing Model');
    expect(card.textContent).toContain('A learning reference from your teacher');
    expect(card.querySelector('b')).toBeNull();
    expect(card.querySelector('.wm-card__text')!.textContent).toBe('Paragraph one.\n\nParagraph <b>two</b>.');
  });
});
