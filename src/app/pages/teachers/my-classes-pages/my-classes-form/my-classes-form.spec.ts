import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MyClassesForm } from './my-classes-form';
import { routedHttpTestProviders } from '../../../../testing/routed-http-test.providers';
import { ClassApiService, type BackendClass } from '../../../../api/class-api.service';
import { AlertService } from '../../../../services/alert.service';

describe('MyClassesForm', () => {
  let component: MyClassesForm;
  let fixture: ComponentFixture<MyClassesForm>;
  let classApi: jasmine.SpyObj<ClassApiService>;
  let alert: jasmine.SpyObj<AlertService>;

  beforeEach(async () => {
    classApi = jasmine.createSpyObj<ClassApiService>('ClassApiService', ['createClass', 'updateClass']);
    alert = jasmine.createSpyObj<AlertService>('AlertService', ['showError', 'showSuccess']);
    await TestBed.configureTestingModule({
      imports: [MyClassesForm],
      providers: [...routedHttpTestProviders(),
        { provide: ClassApiService, useValue: classApi }, { provide: AlertService, useValue: alert }]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MyClassesForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  function validForm(): void {
    component.classForm.patchValue({ className: 'Biology', description: 'Biology class description',
      subjectLevel: 'Grade 8', startDate: '2026-09-01', endDate: '2026-09-08' });
  }

  it('emits the authoritative created class exactly once', async () => {
    const created = { _id: 'class-1', name: 'Biology', description: 'Biology class description',
      teacher: 'teacher-1', joinCode: 'ABC123', isActive: true, status: 'active',
      createdAt: '2026-09-01', updatedAt: '2026-09-01' } as BackendClass;
    classApi.createClass.and.resolveTo(created);
    const emitted = jasmine.createSpy('created');
    component.created.subscribe(emitted);
    validForm();
    component.onSubmit();
    component.onSubmit();
    await fixture.whenStable();
    expect(classApi.createClass).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveBeenCalledOnceWith(created);
  });

  it('does not emit or add a fake class when creation fails', async () => {
    classApi.createClass.and.rejectWith(new Error('Create failed'));
    const emitted = jasmine.createSpy('created');
    component.created.subscribe(emitted);
    validForm();
    component.onSubmit();
    await fixture.whenStable();
    expect(emitted).not.toHaveBeenCalled();
    expect(alert.showError).toHaveBeenCalledWith('Failed to create class', 'Create failed');
  });
});
