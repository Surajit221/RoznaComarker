import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReportBarList } from './report-bar-list';

describe('ReportBarList', () => {
  let fixture: ComponentFixture<ReportBarList>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ReportBarList] }).compileComponents();
    fixture = TestBed.createComponent(ReportBarList);
    host = fixture.nativeElement;
  });

  const render = (inputs: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
  };

  it('renders a labelled list of bars with text values and marks strongest and weakest in words, not colour alone', () => {
    render({ ariaLabel: 'Rubric averages', items: [
      { key: 'CONTENT', label: 'Content', percent: 80, valueText: '80%', marker: 'strongest' },
      { key: 'GRAMMAR', label: 'Grammar', percent: 60, valueText: '60%', marker: 'weakest' },
      { key: 'MECHANICS', label: 'Mechanics', percent: 70, valueText: '70%' }] });
    const list = host.querySelector('[role="list"]')!;
    expect(list.getAttribute('aria-label')).toBe('Rubric averages');
    const items = Array.from(list.querySelectorAll('[role="listitem"]'));
    expect(items.length).toBe(3);
    expect(items[0].textContent).toContain('Content');
    expect(items[0].textContent).toContain('80%');
    expect(items[0].textContent).toContain('Strongest');
    expect(items[1].textContent).toContain('Weakest');
    expect(items[2].textContent).not.toMatch(/Strongest|Weakest/);
    const fill = items[0].querySelector('.report-bar-list__fill') as HTMLElement;
    expect(fill.style.width).toBe('80%');
    expect(fill.getAttribute('aria-hidden')).toBe('true');
  });

  it('clamps widths and uses a given colour or the theme colour', () => {
    render({ ariaLabel: 'Errors', items: [
      { key: 'a', label: 'A', percent: 140, valueText: '3', color: '#15803D' },
      { key: 'b', label: 'B', percent: -5, valueText: '0' }] });
    const fills = Array.from(host.querySelectorAll('.report-bar-list__fill')) as HTMLElement[];
    expect(fills[0].style.width).toBe('100%');
    expect(fills[1].style.width).toBe('0%');
    expect(fills[0].style.background).toContain('rgb(21, 128, 61)');
    expect(fills[1].getAttribute('style')).toContain('var(--color-primary)');
  });

  it('shows an empty message when there are no items', () => {
    render({ ariaLabel: 'Rubric averages', items: [], emptyText: 'No rubric scores yet.' });
    expect(host.querySelector('[role="list"]')).toBeNull();
    expect(host.textContent).toContain('No rubric scores yet.');
  });
});
