import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CreditsApiService } from '../../api/credits-api.service';
import { AlertService } from '../../services/alert.service';
import { AdminCredits } from './admin-credits';

describe('AdminCredits', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminCredits],
      providers: [
        provideRouter([]),
        { provide: CreditsApiService, useValue: { searchTeachers: jasmine.createSpy().and.resolveTo([]) } },
        { provide: AlertService, useValue: {} }
      ]
    }).compileComponents();
  });

  it('shows a useful empty state before a teacher is selected', () => {
    const fixture = TestBed.createComponent(AdminCredits); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Select a teacher');
    expect(fixture.nativeElement.textContent).toContain('Search by name or email');
  });

  it('does not overflow the page at supported phone widths', () => {
    const fixture = TestBed.createComponent(AdminCredits); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    for (const width of [320, 360, 375, 390, 430]) {
      host.style.width = `${width}px`;
      expect(host.scrollWidth).withContext(`${width}px viewport`).toBeLessThanOrEqual(host.clientWidth);
    }
  });
});
