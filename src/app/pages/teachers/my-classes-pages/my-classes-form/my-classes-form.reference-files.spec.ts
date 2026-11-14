import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MyClassesForm } from './my-classes-form';
import { ModalDialog } from '../../../../shared/modal-dialog/modal-dialog';
import type { PendingReferenceFile } from '../../../../components/teacher/reference-files-field/reference-files-field';
import { routedHttpTestProviders } from '../../../../testing/routed-http-test.providers';
import { ClassApiService, type BackendClass } from '../../../../api/class-api.service';
import { AlertService } from '../../../../services/alert.service';
import { ReferenceFilesApiService, REFERENCE_FILES_OFF } from '../../../../api/reference-files-api.service';
import { ReferenceFilesField } from '../../../../components/teacher/reference-files-field/reference-files-field';

// Reference files in the class form: create and edit. The field is tested in reference-files-field.spec.ts; its methods are spied on here.
describe('MyClassesForm reference files', () => {
  let fixture: ComponentFixture<MyClassesForm>, component: MyClassesForm;
  let classApi: jasmine.SpyObj<ClassApiService>, alert: jasmine.SpyObj<AlertService>, refApi: jasmine.SpyObj<ReferenceFilesApiService>;
  const settle = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };
  const created = { _id: 'class-1', name: 'Biology' } as BackendClass;

  async function setup(config = { enabled: true, maxFiles: 5, maxFileBytes: 10 * 1024 * 1024 }) {
    classApi = jasmine.createSpyObj<ClassApiService>('ClassApiService', ['createClass', 'updateClass']);
    alert = jasmine.createSpyObj<AlertService>('AlertService', ['showError', 'showSuccess', 'showWarning', 'showToast', 'showConfirm']);
    refApi = jasmine.createSpyObj<ReferenceFilesApiService>('ReferenceFilesApiService', ['config', 'list']);
    refApi.config.and.resolveTo(config);
    refApi.list.and.resolveTo({ files: [], limits: { maxFiles: 5, maxFileBytes: 1 } });
    await TestBed.configureTestingModule({ imports: [MyClassesForm], providers: [...routedHttpTestProviders(),
      { provide: ClassApiService, useValue: classApi }, { provide: AlertService, useValue: alert }, { provide: ReferenceFilesApiService, useValue: refApi }] }).compileComponents();
    fixture = TestBed.createComponent(MyClassesForm);
    component = fixture.componentInstance;
    fixture.detectChanges(); await settle(); fixture.detectChanges();
  }
  const fill = () => component.classForm.patchValue({ className: 'Biology', description: 'Biology class description', subjectLevel: 'all',
    startDate: '2026-09-01', endDate: '2026-09-08' });
  const field = () => component.referenceFiles as ReferenceFilesField;

  it('shows the class field (create) with class-wide wording; hidden entirely with the feature off', async () => {
    await setup();
    expect(field().scope).toBe('class');
    expect(field().targetId).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('They apply to every assignment in this class.');
    TestBed.resetTestingModule();
    await setup(REFERENCE_FILES_OFF);
    expect(fixture.nativeElement.textContent).not.toContain('Reference files for AI marking');
  });

  it('create: files upload to the new class before the class is handed over', async () => {
    await setup(); fill();
    const order: string[] = [];
    classApi.createClass.and.callFake(async () => { order.push('create'); return created; });
    spyOn(field(), 'hasStaged').and.returnValue(true);
    spyOn(field(), 'uploadStaged').and.callFake(async (id: string) => { order.push(`upload:${id}`); return { uploaded: [], failed: [] }; });
    component.created.subscribe(() => order.push('created'));
    component.onSubmit(); await fixture.whenStable(); await settle();
    expect(order).toEqual(['create', 'upload:class-1', 'created']);
    expect(alert.showWarning).not.toHaveBeenCalled();
  });

  it('create: refused files are reported; the class is still created', async () => {
    await setup(); fill();
    classApi.createClass.and.resolveTo(created);
    spyOn(field(), 'hasStaged').and.returnValue(true);
    spyOn(field(), 'uploadStaged').and.resolveTo({ uploaded: [], failed: [{ name: 'deck.pptx', message: 'This file is password protected. Please upload an unlocked copy.' }] });
    const emitted = jasmine.createSpy('created');
    component.created.subscribe(emitted);
    component.onSubmit(); await fixture.whenStable(); await settle();
    expect(alert.showWarning).toHaveBeenCalledOnceWith('Class created, but some files were not added',
      'deck.pptx: This file is password protected. Please upload an unlocked copy. You can add files again from Edit class.');
    expect(emitted).toHaveBeenCalledOnceWith(created);
  });

  it('edit: the field is bound to the class, and Update uploads files still waiting', async () => {
    await setup();
    fixture.componentRef.setInput('mode', 'edit'); fixture.componentRef.setInput('classId', 'class-1');
    fixture.componentRef.setInput('classData', created); fixture.detectChanges(); fill();
    expect(field().targetId).toBe('class-1');
    classApi.updateClass.and.resolveTo(created);
    spyOn(field(), 'hasStaged').and.returnValue(true);
    const upload = spyOn(field(), 'uploadStaged').and.resolveTo({ uploaded: [], failed: [] });
    component.onSubmit(); await fixture.whenStable(); await settle();
    expect(upload).toHaveBeenCalledOnceWith('class-1');
  });

  it('create without files is unchanged', async () => {
    await setup(); fill();
    classApi.createClass.and.resolveTo(created);
    const upload = spyOn(field(), 'uploadStaged');
    component.onSubmit(); await fixture.whenStable(); await settle();
    expect(upload).not.toHaveBeenCalled();
  });

  it('is busy while saving or while files upload', async () => {
    await setup();
    expect(component.busy()).toBeFalse();
    component.isSubmitting = true;
    expect(component.busy()).toBeTrue();
    component.isSubmitting = false;
    field().pending.set([uploadingEntry()]);
    expect(component.busy()).toBeTrue();
    field().pending.set([]);
    expect(component.busy()).toBeFalse();
  });
});

const uploadingEntry = (): PendingReferenceFile => ({ key: 'k1', file: new File(['x'], 'notes.pdf'), name: 'notes.pdf', sizeBytes: 1, markedAsRubric: false,
  state: 'uploading', progress: 40, error: null, requestId: 'request-0001' });

// The Update Class dialog as my-classes-pages hosts it: a backdrop click while files upload must not close the dialog (and lose the upload).
@Component({ imports: [ModalDialog, MyClassesForm], template: `<app-modal-dialog [open]="true" [dismissible]="!editClassForm.busy()" (closed)="closedCount = closedCount + 1">
  <app-my-classes-form #editClassForm mode="edit" classId="class-1"></app-my-classes-form></app-modal-dialog>` })
class EditClassDialogHost { closedCount = 0; @ViewChild(MyClassesForm) form!: MyClassesForm; }

describe('Update Class dialog while reference files upload', () => {
  it('ignores backdrop clicks while files upload, and closes again once they are done', async () => {
    const refApi = jasmine.createSpyObj<ReferenceFilesApiService>('ReferenceFilesApiService', ['config', 'list']);
    refApi.config.and.resolveTo({ enabled: true, maxFiles: 5, maxFileBytes: 10 * 1024 * 1024 });
    refApi.list.and.resolveTo({ files: [], limits: { maxFiles: 5, maxFileBytes: 1 } });
    await TestBed.configureTestingModule({ imports: [EditClassDialogHost], providers: [...routedHttpTestProviders(),
      { provide: ClassApiService, useValue: jasmine.createSpyObj<ClassApiService>('ClassApiService', ['createClass', 'updateClass']) },
      { provide: AlertService, useValue: jasmine.createSpyObj<AlertService>('AlertService', ['showError', 'showSuccess', 'showWarning']) },
      { provide: ReferenceFilesApiService, useValue: refApi }] }).compileComponents();
    const host = TestBed.createComponent(EditClassDialogHost);
    host.detectChanges(); for (let i = 0; i < 10; i += 1) await Promise.resolve(); host.detectChanges();
    const backdrop = () => host.nativeElement.querySelector('app-modal-dialog > div') as HTMLElement;
    (host.componentInstance.form.referenceFiles as ReferenceFilesField).pending.set([uploadingEntry()]);
    host.detectChanges();
    backdrop().click();
    expect(host.componentInstance.closedCount).toBe(0);
    (host.componentInstance.form.referenceFiles as ReferenceFilesField).pending.set([]);
    host.detectChanges();
    backdrop().click();
    expect(host.componentInstance.closedCount).toBe(1);
  });
});
