import { ComponentFixture, TestBed, fakeAsync, flush, flushMicrotasks, tick } from '@angular/core/testing';
import { ApplicationRef, signal } from '@angular/core';

import { DetailMyClassesPages } from './detail-my-classes-pages';
import { GuestSubmissionFeature } from '../../../../services/guest-submission-feature.service';
import { AudioConfigService } from '../../../../services/audio-config.service';
import { AlertService } from '../../../../services/alert.service';
import { SpeakingAssignmentsFacade } from '../../../../services/speaking-assignments.facade';
import { AssignmentForm } from './assignment-form/assignment-form';
import { SpeakingAssignmentForm } from '../../../../components/teacher/speaking-assignment-form/speaking-assignment-form';
import { authenticatedUserProviders, httpTestingProviders, referenceFilesOffProviders, routedComponentProviders } from '../../../../../testing/standalone-test-providers';

// The Create Assignment dialog (desktop modal and phone/tablet bottom sheet): one close rule for the backdrop, Esc, the X button and the
// forms' Cancel. Nothing typed or chosen: closes at once. Unsaved input: the "Discard changes?" SweetAlert, closing only on Discard.
describe('DetailMyClassesPages Create Assignment dialog closing', () => {
  let fixture: ComponentFixture<DetailMyClassesPages>;
  let component: DetailMyClassesPages;
  let confirm: jasmine.Spy;
  let answer: (value: boolean) => void;

  for (const desktop of [true, false]) {
    const where = desktop ? 'modal' : 'sheet';
    describe(`(${where})`, () => {
      beforeEach(async () => {
        document.querySelectorAll('.swal2-container').forEach(el => el.remove());
        await TestBed.configureTestingModule({
          imports: [DetailMyClassesPages],
          providers: [{ provide: GuestSubmissionFeature, useValue: { enabled: () => false, state: () => 'disabled', load: () => Promise.resolve(false), settled: () => Promise.resolve('disabled') } },
            { provide: AudioConfigService, useValue: { enabled: signal(true), maxMinutes: signal(7), load: () => Promise.resolve() } },
            ...routedComponentProviders(), ...httpTestingProviders, ...referenceFilesOffProviders, ...authenticatedUserProviders('teacher')]
        }).compileComponents();
        fixture = TestBed.createComponent(DetailMyClassesPages);
        component = fixture.componentInstance;
        spyOn(component.device, 'isDesktop').and.returnValue(desktop);
        spyOn(component.device, 'isMobile').and.returnValue(!desktop);
        spyOn(component.device, 'isTablet').and.returnValue(false);
        confirm = spyOn(TestBed.inject(AlertService), 'showConfirm').and.callFake(() => new Promise<boolean>(resolve => { answer = resolve; }));
        fixture.detectChanges();
        document.body.appendChild(fixture.nativeElement);
      });
      afterEach(() => { fixture.nativeElement.remove(); document.body.classList.remove('overflow-hidden'); });

      const host = () => fixture.nativeElement as HTMLElement;
      const dialog = () => host().querySelector<HTMLElement>(`[data-create-dialog="${where}"]`)!;
      const isOpen = () => (desktop ? component.showDialog : component.openSheetAssignment);
      const createButton = () => Array.from(host().querySelectorAll<HTMLButtonElement>('button'))
        .find(b => b.textContent!.trim() === (desktop ? 'Create Assignment' : '+ Assignment'))!;
      const open = () => { createButton().focus(); createButton().click(); fixture.detectChanges(); tick(); fixture.detectChanges(); };
      const choose = (kind: 'writing' | 'speaking') => { TestBed.inject(SpeakingAssignmentsFacade).choose(kind); fixture.detectChanges(); };
      const speakingForm = () => fixture.debugElement.query(el => el.componentInstance instanceof SpeakingAssignmentForm)!.componentInstance as SpeakingAssignmentForm;
      const writingForm = () => fixture.debugElement.query(el => el.componentInstance instanceof AssignmentForm)!.componentInstance as AssignmentForm;
      const closeX = () => dialog().querySelector<HTMLButtonElement>('button[data-create-close]')!;
      const cancel = () => Array.from(dialog().querySelectorAll<HTMLButtonElement>('button')).filter(b => b.textContent!.trim() === 'Cancel' && b.offsetParent !== null)[0];
      const backdrop = () => dialog().querySelector<HTMLElement>('.fixed.inset-0')!;
      const esc = () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); fixture.detectChanges(); };
      const settle = () => { flushMicrotasks(); fixture.detectChanges(); tick(); fixture.detectChanges(); };
      const makeDirty = (kind: 'writing' | 'speaking') => {
        if (kind === 'speaking') speakingForm().form.controls.title.setValue('Describe your town');
        else writingForm().classForm.get('className')!.setValue('My essay');
        fixture.detectChanges();
      };
      const paths: [string, () => void][] = [
        ['backdrop', () => { backdrop().click(); fixture.detectChanges(); }],
        ['Esc', esc],
        ['X', () => { closeX().click(); fixture.detectChanges(); }]
      ];

      it('the dialog is labelled: role dialog, aria-modal, aria-labelledby the visible title, and an X button labelled "Close"', fakeAsync(() => {
        open();
        const panel = dialog().querySelector<HTMLElement>('[role="dialog"]')!;
        expect(panel.getAttribute('aria-modal')).toBe('true');
        const title = document.getElementById(panel.getAttribute('aria-labelledby')!)!;
        expect(title.textContent!.trim()).toBe('Create Assignment');
        expect(closeX().getAttribute('aria-label')).toBe('Close');
        expect(closeX().type).toBe('button');
        flush();
      }));

      it('the page behind does not scroll while the dialog is open', fakeAsync(() => {
        open();
        expect(document.body.classList).toContain('overflow-hidden');
        closeX().click(); fixture.detectChanges(); settle();
        expect(document.body.classList).not.toContain('overflow-hidden');
        flush();
      }));

      for (const [name, close] of paths) {
        it(`choice step: ${name} closes at once (nothing to lose) and focus returns to the create button`, fakeAsync(() => {
          open();
          expect(host().querySelector('app-assignment-type-choice')).not.toBeNull();
          close(); settle();
          expect(isOpen()).toBeFalse();
          expect(confirm).not.toHaveBeenCalled();
          expect(document.activeElement).toBe(createButton());
          flush();
        }));
      }

      for (const kind of ['speaking', 'writing'] as const) {
        for (const [name, close] of [...paths, ['Cancel', () => { cancel().click(); fixture.detectChanges(); }] as [string, () => void]]) {
          it(`${kind} form, clean: ${name} closes at once without the SweetAlert`, fakeAsync(() => {
            open(); choose(kind);
            close(); settle();
            expect(isOpen()).toBeFalse();
            expect(confirm).not.toHaveBeenCalled();
            expect(document.activeElement).toBe(createButton());
            flush();
          }));

          it(`${kind} form, dirty: ${name} shows "Discard changes?"; Discard closes and focus returns`, fakeAsync(() => {
            open(); choose(kind); makeDirty(kind);
            close(); settle();
            expect(confirm).toHaveBeenCalledOnceWith('Discard changes?', 'You have unsaved changes to this assignment. If you close now, they will be lost.',
              'Discard', 'Keep editing', { returnFocus: false });
            expect(isOpen()).toBeTrue();
            answer(true); settle();
            expect(isOpen()).toBeFalse();
            expect(document.activeElement).toBe(createButton());
            flush();
          }));

          it(`${kind} form, dirty: ${name} then Keep editing leaves the dialog open with the input kept`, fakeAsync(() => {
            open(); choose(kind); makeDirty(kind);
            close(); settle();
            answer(false); settle();
            expect(isOpen()).toBeTrue();
            if (kind === 'speaking') expect(speakingForm().form.controls.title.value).toBe('Describe your town');
            else expect(writingForm().classForm.get('className')!.value).toBe('My essay');
            flush();
          }));
        }
      }

      it('Keep editing puts focus back where it was (this page moves focus itself, not SweetAlert)', fakeAsync(() => {
        open(); choose('speaking'); makeDirty('speaking');
        const title = dialog().querySelector<HTMLInputElement>('#speaking-title')!;
        title.focus();
        esc(); settle();
        (document.activeElement as HTMLElement).blur();
        answer(false); settle();
        expect(document.activeElement).toBe(title);
        flush();
      }));

      it('opening moves focus to the dialog title once the dialog is rendered', fakeAsync(() => {
        open();
        fixture.detectChanges(); TestBed.inject(ApplicationRef).tick(); flush();
        expect(document.activeElement?.id).toBe(`create-assignment-title-${where}`);
      }));

      it('after Discard the writing form is empty the next time the dialog opens', fakeAsync(() => {
        open(); choose('writing'); makeDirty('writing');
        closeX().click(); fixture.detectChanges(); settle(); answer(true); settle();
        open(); choose('writing');
        expect(writingForm().classForm.get('className')!.value).toBeFalsy();
        expect(writingForm().hasUnsavedChanges()).toBeFalse();
        flush();
      }));

      it('Esc while the SweetAlert is open is left to the SweetAlert: no second prompt, the dialog stays', fakeAsync(() => {
        open(); choose('speaking'); makeDirty('speaking');
        esc(); settle();
        const container = document.createElement('div'); container.className = 'swal2-container'; container.innerHTML = '<div class="swal2-popup"></div>'; document.body.appendChild(container);
        esc(); settle();
        expect(confirm).toHaveBeenCalledTimes(1);
        answer(false); settle(); container.remove();
        expect(isOpen()).toBeTrue();
        flush();
      }));

      it('a double click on Discard (or a second close request while asking) cannot close twice', fakeAsync(() => {
        open(); choose('speaking'); makeDirty('speaking');
        const closeDialog = spyOn(component, desktop ? 'closeDialog' : 'onCloseCreateAssignment').and.callThrough();
        closeX().click(); closeX().click(); backdrop().click(); fixture.detectChanges(); settle();
        expect(confirm).toHaveBeenCalledTimes(1);
        answer(true); answer(true); settle();
        expect(closeDialog).toHaveBeenCalledTimes(1);
        flush();
      }));

      it('Esc while a dialog inside the form is open (the rubric library) does not close the Create Assignment dialog', fakeAsync(() => {
        open(); choose('speaking');
        speakingForm().rubricSelectorOpen = true; fixture.detectChanges();
        esc(); settle();
        expect(isOpen()).toBeTrue();
        flush();
      }));

      it('while the form is saving, the backdrop, Esc and X do nothing', fakeAsync(() => {
        open(); choose('speaking'); makeDirty('speaking');
        TestBed.inject(SpeakingAssignmentsFacade).busy.set(true); fixture.detectChanges();
        backdrop().click(); esc(); closeX().click(); fixture.detectChanges(); settle();
        expect(isOpen()).toBeTrue();
        expect(confirm).not.toHaveBeenCalled();
        TestBed.inject(SpeakingAssignmentsFacade).busy.set(false);
        flush();
      }));

      it('while saving, a dismiss request that reaches the page anyway is ignored (second guard behind the disabled X and dismissible)', fakeAsync(() => {
        open(); choose('speaking'); makeDirty('speaking');
        TestBed.inject(SpeakingAssignmentsFacade).busy.set(true);
        void component.requestCloseCreateAssignment(where); settle();
        expect(isOpen()).toBeTrue();
        expect(confirm).not.toHaveBeenCalled();
        TestBed.inject(SpeakingAssignmentsFacade).busy.set(false);
        flush();
      }));

      it('Tab and Shift+Tab stay inside the dialog (focus trap)', fakeAsync(() => {
        open();
        const panel = dialog().querySelector<HTMLElement>('[role="dialog"]')!;
        const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, textarea')).filter(el => el.offsetParent !== null);
        const first = focusable[0], last = focusable[focusable.length - 1];
        last.focus();
        const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
        last.dispatchEvent(tab);
        expect(tab.defaultPrevented).toBeTrue();
        expect(document.activeElement).toBe(first);
        const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
        first.dispatchEvent(back);
        expect(document.activeElement).toBe(last);
        flush();
      }));

      it('a successful save closes without asking (the saved input is not "unsaved")', fakeAsync(() => {
        open(); choose('speaking'); makeDirty('speaking');
        spyOn(component, 'loadAssignments' as never).and.resolveTo(undefined as never);
        speakingForm().created.emit({ _id: 'new', resourceType: 'speaking' } as never);
        settle();
        expect(isOpen()).toBeFalse();
        expect(confirm).not.toHaveBeenCalled();
        flush();
      }));
    });
  }

  it('other modal dialogs are unchanged: no role, no Esc handling unless asked for', async () => {
    await TestBed.configureTestingModule({
      imports: [DetailMyClassesPages],
      providers: [{ provide: GuestSubmissionFeature, useValue: { enabled: () => false, state: () => 'disabled', load: () => Promise.resolve(false), settled: () => Promise.resolve('disabled') } },
        { provide: AudioConfigService, useValue: { enabled: signal(true), maxMinutes: signal(7), load: () => Promise.resolve() } },
        ...routedComponentProviders(), ...httpTestingProviders, ...referenceFilesOffProviders, ...authenticatedUserProviders('teacher')]
    }).compileComponents();
    fixture = TestBed.createComponent(DetailMyClassesPages);
    component = fixture.componentInstance;
    spyOn(component.device, 'isDesktop').and.returnValue(true);
    fixture.detectChanges();
    component.showDialogQRClasses = true; fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(component.showDialogQRClasses).toBeTrue();
  });
});
