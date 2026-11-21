// Stage 10b: guests on a speaking assignment, the teacher's side. The QR code and link of a speaking card open the guest speaking page
// (/student/assignments/qr/<token>/speaking, the essay address plus /speaking) and the button shows only while guests are allowed. Essay cards
// keep their QR button and address.
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DetailMyClassesPages } from './detail-my-classes-pages';
import { GuestSubmissionFeature } from '../../../../services/guest-submission-feature.service';
import { AudioConfigService } from '../../../../services/audio-config.service';
import { QrGeneratorService } from '../../../../services/qr-generator.service';
import { authenticatedUserProviders, httpTestingProviders, referenceFilesOffProviders, routedComponentProviders } from '../../../../../testing/standalone-test-providers';

describe('QrGeneratorService: the speaking guest address', () => {
  it('is the essay QR address plus /speaking; the essay address is unchanged', () => {
    const qr = TestBed.inject(QrGeneratorService);
    expect(qr.generateSpeakingAssignmentUrl('tok en')).toBe(`${location.origin}/student/assignments/qr/tok%20en/speaking`);
    expect(qr.generateAssignmentUrl('tok en')).toBe(`${location.origin}/student/assignments/qr/tok%20en`);
  });
});

describe('DetailMyClassesPages: speaking QR code (stage 10b)', () => {
  let fixture: ComponentFixture<DetailMyClassesPages>;
  let component: DetailMyClassesPages;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DetailMyClassesPages],
      providers: [{ provide: GuestSubmissionFeature, useValue: { enabled: () => true, state: () => 'enabled', load: () => Promise.resolve(true), settled: () => Promise.resolve('enabled') } },
        { provide: AudioConfigService, useValue: { enabled: signal(true), maxMinutes: signal(7), maxFileBytes: signal(41943040), load: () => Promise.resolve() } },
        ...routedComponentProviders(), ...httpTestingProviders, ...referenceFilesOffProviders, ...authenticatedUserProviders('teacher')] }).compileComponents();
    fixture = TestBed.createComponent(DetailMyClassesPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
  const item = (id: string, resourceType: 'essay' | 'speaking') =>
    ({ id, title: `Assignment ${id}`, dueDate: 'Tomorrow', submitted: 0, total: 0, status: 'pending' as const, resourceType, instructions: `Task ${id}` });
  const byId = (records: Record<string, unknown>) => { (component as unknown as { assignmentsById: Record<string, unknown> }).assignmentsById = records; };
  const qrButtons = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.assignment-utility--qr'));

  for (const desktop of [true, false]) {
    it(`a speaking card shows "QR Code" only while guests are allowed; an essay card always does (desktop=${desktop})`, () => {
      spyOn(component.device, 'isDesktop').and.returnValue(desktop);
      spyOn(component.device, 'isMobile').and.returnValue(!desktop);
      byId({ s1: { _id: 's1', resourceType: 'speaking', qrToken: 'sq', allowGuestSubmission: false }, e1: { _id: 'e1', resourceType: 'essay', qrToken: 'eq' } });
      component.assignments = [item('s1', 'speaking'), item('e1', 'essay')];
      fixture.detectChanges();
      expect(qrButtons().length).toBe(1);
      byId({ s1: { _id: 's1', resourceType: 'speaking', qrToken: 'sq', allowGuestSubmission: true }, e1: { _id: 'e1', resourceType: 'essay', qrToken: 'eq' } });
      fixture.detectChanges();
      expect(qrButtons().length).toBe(2);
      expect(qrButtons()[0].getAttribute('aria-label')).toBe('QR code and guest link for Assignment s1');
    });
  }

  it('the QR code of a speaking assignment opens the guest speaking page; an essay one the essay page', () => {
    byId({ s1: { _id: 's1', title: 'Talk', resourceType: 'speaking', qrToken: 'sq', allowGuestSubmission: true }, e1: { _id: 'e1', title: 'Essay', resourceType: 'essay', qrToken: 'eq' } });
    component.openAssignmentQr('s1');
    expect(component.selectedAssignmentQrValue).toBe(`${location.origin}/student/assignments/qr/sq/speaking`);
    expect(component.selectedQrInstruction).toBe('Students can scan this QR code to record and upload their answer. No account needed.');
    component.closeAssignmentQr();
    component.openAssignmentQr('e1');
    expect(component.selectedAssignmentQrValue).toBe(`${location.origin}/student/assignments/qr/eq`);
    expect(component.selectedQrInstruction).toBe('Students can scan this QR code to open the assignment.');
  });
});
