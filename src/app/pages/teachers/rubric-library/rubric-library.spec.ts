import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { RubricLibraryPage } from './rubric-library';
import { RubricLibraryStateService } from '../../../services/rubric-library-state.service';
import { RubricApiService } from '../../../api/rubric-api.service';
import { AlertService } from '../../../services/alert.service';
import { Router } from '@angular/router';

const rubric = (overrides: any = {}) => ({ _id: 'rubric-1', name: 'Argument Writing', description: 'Reusable', writingType: 'Argumentative',
  isActive: true, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z', rubricData: { totalPoints: 100,
    criteria: ['Evidence', 'Organization', 'Language'].map((name, i) => ({ name, weight: i === 2 ? 34 : 33,
      levels: [{ title: 'Strong', score: 4, description: 'Strong work' }, { title: 'Developing', score: 2, description: 'Developing work' }] })) }, ...overrides });

describe('RubricLibraryPage', () => {
  let fixture: ComponentFixture<RubricLibraryPage>; let component: RubricLibraryPage;
  const state = { rubrics: signal<any[]>([]), loading: signal(false), error: signal(''), load: jasmine.createSpy('load').and.resolveTo(),
    upsert: jasmine.createSpy('upsert'), remove: jasmine.createSpy('remove'), useForNextAssignment: jasmine.createSpy('useForNextAssignment') };
  const api = { createSavedRubric: jasmine.createSpy('createSavedRubric'), updateSavedRubric: jasmine.createSpy('updateSavedRubric'),
    duplicateSavedRubric: jasmine.createSpy('duplicateSavedRubric'), archiveSavedRubric: jasmine.createSpy('archiveSavedRubric') };
  const alert = { showToast: jasmine.createSpy('showToast'), showError: jasmine.createSpy('showError'),
    showConfirm: jasmine.createSpy('showConfirm').and.resolveTo(true) };
  const router = { navigate: jasmine.createSpy('navigate').and.resolveTo(true) };

  beforeEach(async () => {
    state.rubrics.set([rubric()]); state.load.calls.reset(); state.upsert.calls.reset(); state.remove.calls.reset();
    Object.values(api).forEach((spy: any) => spy.calls.reset());
    await TestBed.configureTestingModule({ imports: [RubricLibraryPage], providers: [
      { provide: RubricLibraryStateService, useValue: state }, { provide: RubricApiService, useValue: api },
      { provide: AlertService, useValue: alert }, { provide: Router, useValue: router }
    ] }).compileComponents();
    fixture = TestBed.createComponent(RubricLibraryPage); component = fixture.componentInstance; fixture.detectChanges();
  });

  it('loads the library and filters reactively by rubric name', () => {
    expect(state.load).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('Argument Writing');
    component.query.set('missing'); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Argument Writing');
  });

  it('creates and edits using the same rubric designer structure', async () => {
    component.newRubric(); component.name = 'New Rubric'; component.workingDesigner = { title: 'New', totalPoints: 100,
      levels: [{ title: 'Strong', maxPoints: 4 }, { title: 'Developing', maxPoints: 2 }], criteria: rubric().rubricData.criteria.map((row: any) => ({ title: row.name, weight: row.weight, cells: ['Strong', 'Developing'] })) };
    api.createSavedRubric.and.resolveTo(rubric({ _id: 'new', name: 'New Rubric' }));
    await component.save();
    expect(api.createSavedRubric).toHaveBeenCalledTimes(1); expect(state.upsert).toHaveBeenCalled();

    component.edit(rubric()); component.name = 'Renamed'; api.updateSavedRubric.and.resolveTo(rubric({ name: 'Renamed' }));
    await component.save();
    expect(api.updateSavedRubric).toHaveBeenCalledWith('rubric-1', jasmine.objectContaining({ name: 'Renamed' }));
  });

  it('duplicates and archives without reloading the page', async () => {
    api.duplicateSavedRubric.and.resolveTo(rubric({ _id: 'copy', name: 'Argument Writing - Copy' }));
    await component.duplicate(rubric());
    expect(state.upsert).toHaveBeenCalledWith(jasmine.objectContaining({ _id: 'copy' }));
    api.archiveSavedRubric.and.resolveTo(); await component.archive(rubric());
    expect(api.archiveSavedRubric).toHaveBeenCalledOnceWith('rubric-1'); expect(state.remove).toHaveBeenCalledOnceWith('rubric-1');
  });

  it('preview exposes criteria through labeled, non-icon-only actions', () => {
    fixture.nativeElement.querySelector('[aria-label="Preview rubric"]').click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]').textContent).toContain('Evidence');
    expect(fixture.nativeElement.querySelector('[aria-label="Edit rubric"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[aria-label="Duplicate rubric"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[aria-label="Archive rubric"]')).toBeTruthy();
  });

  it('carries Use into the next assignment flow', async () => {
    await component.use(rubric());
    expect(state.useForNextAssignment).toHaveBeenCalledWith(jasmine.objectContaining({ _id: 'rubric-1' }));
    expect(router.navigate).toHaveBeenCalledWith(['/teacher/my-classes']);
  });
});
