import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AssignmentTypeChoice } from './assignment-type-choice';

// The choice step polish: one helper line and one meta chip per card (the speaking chip follows the audio config), arrow-key
// navigation between the two cards, and a selected state that is not shown by colour alone (aria-pressed and a check icon).
describe('AssignmentTypeChoice keyboard, chips and selected state', () => {
  let fixture: ComponentFixture<AssignmentTypeChoice>;
  const host = () => fixture.nativeElement as HTMLElement;
  const cards = () => Array.from(host().querySelectorAll<HTMLButtonElement>('button.lt-choice-card'));
  async function create(maxMinutes: number | null = 7) {
    await TestBed.configureTestingModule({ imports: [AssignmentTypeChoice] }).compileComponents();
    fixture = TestBed.createComponent(AssignmentTypeChoice);
    fixture.componentRef.setInput('maxMinutes', maxMinutes);
    fixture.detectChanges();
    document.body.appendChild(host());
  }
  afterEach(() => host().remove());
  const key = (target: HTMLElement, name: string) => {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  };

  it('each card has one short helper line and a meta chip; the speaking chip reads the configured maximum', async () => {
    await create(5);
    const [writing, speaking] = cards();
    expect(writing.querySelector('.lt-choice-chip')!.textContent!.trim()).toBe('Handwritten or typed work');
    expect(speaking.querySelector('.lt-choice-chip')!.textContent!.trim()).toBe('Recording up to 5 min');
    for (const card of cards()) {
      expect(card.querySelectorAll('.lt-choice-desc').length).toBe(1);
      expect(card.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('the speaking chip follows a change of the configured maximum (not hardcoded)', async () => {
    await create(7);
    expect(cards()[1].querySelector('.lt-choice-chip')!.textContent!.trim()).toBe('Recording up to 7 min');
    fixture.componentRef.setInput('maxMinutes', 3);
    fixture.detectChanges();
    expect(cards()[1].querySelector('.lt-choice-chip')!.textContent!.trim()).toBe('Recording up to 3 min');
  });

  it('arrow keys move focus between the cards (wrapping), Home and End go to the first and last', async () => {
    await create();
    const [writing, speaking] = cards();
    writing.focus();
    expect(key(writing, 'ArrowRight').defaultPrevented).toBeTrue();
    expect(document.activeElement).toBe(speaking);
    key(speaking, 'ArrowRight');
    expect(document.activeElement).toBe(writing);
    key(writing, 'ArrowLeft');
    expect(document.activeElement).toBe(speaking);
    key(speaking, 'ArrowUp');
    expect(document.activeElement).toBe(writing);
    key(writing, 'ArrowDown');
    expect(document.activeElement).toBe(speaking);
    key(speaking, 'Home');
    expect(document.activeElement).toBe(writing);
    key(writing, 'End');
    expect(document.activeElement).toBe(speaking);
  });

  it('other keys are left to the browser (Tab moves on, Enter activates the native button)', async () => {
    await create();
    const [writing] = cards();
    writing.focus();
    expect(key(writing, 'Tab').defaultPrevented).toBeFalse();
    expect(key(writing, 'Enter').defaultPrevented).toBeFalse();
    for (const card of cards()) expect(card.tabIndex).toBe(0);
  });

  it('choosing marks the chosen card as selected (aria-pressed, class and a check icon), and only that card', async () => {
    await create();
    const chosen: string[] = [];
    fixture.componentInstance.chosen.subscribe((value: string) => chosen.push(value));
    expect(cards().map(card => card.getAttribute('aria-pressed'))).toEqual(['false', 'false']);
    expect(host().querySelector('.lt-choice-check')).toBeNull();
    cards()[1].click();
    fixture.detectChanges();
    expect(chosen).toEqual(['speaking']);
    const [writing, speaking] = cards();
    expect(speaking.getAttribute('aria-pressed')).toBe('true');
    expect(speaking.classList).toContain('is-selected');
    expect(speaking.querySelector('.lt-choice-check i.bx')!.getAttribute('aria-hidden')).toBe('true');
    expect(writing.getAttribute('aria-pressed')).toBe('false');
    expect(writing.classList).not.toContain('is-selected');
  });

  it('the selected card keeps the teal look of the hover state; unselected cards keep the plain border', async () => {
    await create();
    cards()[0].click();
    fixture.detectChanges();
    const [writing, speaking] = cards().map(card => getComputedStyle(card));
    expect(writing.borderTopColor).toBe('rgb(0, 128, 129)');
    expect(speaking.borderTopColor).toBe('rgb(231, 231, 231)');
  });
});
