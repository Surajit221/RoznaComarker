import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { DetailMyClassesPages } from './detail-my-classes-pages';
import { GuestSubmissionFeature } from '../../../../services/guest-submission-feature.service';
import { authenticatedUserProviders, httpTestingProviders, referenceFilesOffProviders, routedComponentProviders } from '../../../../../testing/standalone-test-providers';

// The "Report" button beside "View Submissions": essay assignments only, on the desktop card and the mobile card.
// (This file does not verify outstanding HTTP requests: the page's own startup requests are not what is tested here.)
describe('DetailMyClassesPages Report button', () => {
  let fixture: ComponentFixture<DetailMyClassesPages>;
  let component: DetailMyClassesPages;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailMyClassesPages],
      providers: [{ provide: GuestSubmissionFeature, useValue: { enabled: () => false, state: () => 'disabled', load: () => Promise.resolve(false), settled: () => Promise.resolve('disabled') } },
        ...routedComponentProviders(), ...httpTestingProviders, ...referenceFilesOffProviders, ...authenticatedUserProviders('teacher')]
    }).compileComponents();
    fixture = TestBed.createComponent(DetailMyClassesPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const item = (id: string, resourceType?: 'essay' | 'worksheet' | 'flashcard') =>
    ({ id, title: `Assignment ${id}`, dueDate: 'Tomorrow', submitted: 0, total: 0, status: 'pending' as const, resourceType, resourceId: resourceType && resourceType !== 'essay' ? `r-${id}` : undefined });

  for (const desktop of [true, false]) {
    it(`shows Report beside View Submissions for essays only and routes to the report page (desktop=${desktop})`, () => {
      spyOn(component.device, 'isDesktop').and.returnValue(desktop);
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      component.assignments = [item('e1', 'essay'), item('e2'), item('w1', 'worksheet'), item('f1', 'flashcard')];
      fixture.detectChanges();
      const host: HTMLElement = fixture.nativeElement;
      // Each card list (desktop and/or mobile) renders one primary row per assignment, in order.
      const rows = Array.from(host.querySelectorAll('.teacher-assignment-primary-row'));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length % 4).toBe(0);
      const reportButtons = (i: number) => rows[i].querySelectorAll('button.teacher-assignment-report');
      for (let start = 0; start < rows.length; start += 4) {
        expect(reportButtons(start).length).toBe(1);
        expect(reportButtons(start + 1).length).toBe(1);   // no resourceType = a legacy essay
        expect(reportButtons(start + 2).length).toBe(0);
        expect(reportButtons(start + 3).length).toBe(0);
      }
      for (const row of rows) expect(row.querySelector('.teacher-assignment-primary')!.textContent).toContain('View Submissions');
      const button = reportButtons(0)[0] as HTMLButtonElement;
      expect(button.textContent!.trim()).toContain('Report');
      expect(button.getAttribute('aria-label')).toBe('Open the report for Assignment e1');
      button.click();
      expect(navigate).toHaveBeenCalledOnceWith(['/teacher/assignment-report', 'e1']);
    });
  }
});
