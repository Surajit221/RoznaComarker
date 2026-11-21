import { TestBed } from '@angular/core/testing';
import { AssignmentTypeChoice } from './assignment-type-choice';

// The choice before the form: "Writing assignment" or "Speaking assignment", in the Learning Tools choice-card pattern.
describe('AssignmentTypeChoice', () => {
  const create = async () => {
    await TestBed.configureTestingModule({ imports: [AssignmentTypeChoice] }).compileComponents();
    const fixture = TestBed.createComponent(AssignmentTypeChoice);
    fixture.detectChanges();
    return fixture;
  };

  it('offers two labelled choice cards as buttons, in a labelled group', async () => {
    const fixture = await create();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('.lt-choice-grid')!.getAttribute('role')).toBe('group');
    expect(host.querySelector('.lt-choice-grid')!.getAttribute('aria-label')).toBe('Assignment type');
    const cards = Array.from(host.querySelectorAll<HTMLButtonElement>('button.lt-choice-card'));
    expect(cards.map(c => c.querySelector('.lt-choice-title')!.textContent!.trim())).toEqual(['Writing assignment', 'Speaking assignment']);
    for (const card of cards) {
      expect(card.type).toBe('button');
      expect(card.querySelector('.lt-choice-desc')!.textContent!.trim().length).toBeGreaterThan(10);
      expect(card.querySelector('i.bx')!.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('emits the chosen type (click, and keyboard activation of the native button)', async () => {
    const fixture = await create();
    const chosen: string[] = [];
    fixture.componentInstance.chosen.subscribe((value: string) => chosen.push(value));
    const [writing, speaking] = Array.from(fixture.nativeElement.querySelectorAll('button.lt-choice-card')) as HTMLButtonElement[];
    writing.click();
    speaking.click();
    expect(chosen).toEqual(['writing', 'speaking']);
  });

  it('uses only the existing Learning Tools choice-card colours', async () => {
    const fixture = await create();
    const card = fixture.nativeElement.querySelector('button.lt-choice-card') as HTMLElement;
    const style = getComputedStyle(card);
    expect(style.borderTopColor).toBe('rgb(231, 231, 231)');
    expect(style.borderRadius).toBe('16px');
  });
});
