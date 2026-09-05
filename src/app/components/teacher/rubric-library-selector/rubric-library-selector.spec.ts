import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, SimpleChange } from '@angular/core';
import { RubricLibrarySelector } from './rubric-library-selector';
import { RubricLibraryStateService } from '../../../services/rubric-library-state.service';

describe('RubricLibrarySelector', () => {
  let fixture: ComponentFixture<RubricLibrarySelector>; let component: RubricLibrarySelector;
  const item: any = { _id: 'one', name: 'Argument Rubric', rubricData: { totalPoints: 100, criteria: [{ name: 'Evidence', weight: 100, levels: [] }] } };
  const state = { rubrics: signal<any[]>([item]), loading: signal(false), error: signal(''), load: jasmine.createSpy('load').and.resolveTo() };
  beforeEach(async () => {
    state.load.calls.reset();
    await TestBed.configureTestingModule({ imports: [RubricLibrarySelector], providers: [{ provide: RubricLibraryStateService, useValue: state }] }).compileComponents();
    fixture = TestBed.createComponent(RubricLibrarySelector); component = fixture.componentInstance;
    component.open = true; component.ngOnChanges({ open: new SimpleChange(false, true, false) }); fixture.detectChanges();
  });
  it('loads saved rubrics when opened and emits exactly one selected snapshot', () => {
    const selected = jasmine.createSpy('selected'); component.selected.subscribe(selected);
    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((node: any) => node.textContent.includes('Use Rubric')) as HTMLButtonElement;
    button.click(); expect(state.load).toHaveBeenCalledTimes(1); expect(selected).toHaveBeenCalledOnceWith(item);
  });
  it('searches locally and renders a viewport-safe stacked card selector', () => {
    component.search.set('missing'); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No saved rubrics match');
    expect(fixture.nativeElement.querySelector('.selector__list')).toBeTruthy();
  });
});
