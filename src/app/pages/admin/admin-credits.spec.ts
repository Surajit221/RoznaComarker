import { TestBed } from '@angular/core/testing';
import { CreditsApiService } from '../../api/credits-api.service';
import { AlertService } from '../../services/alert.service';
import { AdminCredits } from './admin-credits';

describe('AdminCredits details drawer', () => {
  const teacher: any = { _id: 'teacher-1', displayName: 'Ada Teacher', email: 'ada@example.com', plan: 'essential', monthlyRemaining: 8, purchasedCredits: 2, bonusCredits: 1, totalAvailable: 11 };
  const details: any = { teacher, wallet: { plan: 'essential', monthlyCredits: 10, monthlyCreditsUsed: 2,
    monthlyCreditsRemaining: 8, purchasedCredits: 2, bonusCredits: 1, availableCredits: 11, resetDate: '2026-10-01' },
    transactions: [], pagination: { page: 1, pages: 1, total: 0 } };
  let api: any;

  beforeEach(async () => {
    api = { searchTeachers: jasmine.createSpy().and.resolveTo({ teachers: [teacher], pagination: { page: 1, pages: 1, total: 1 } }),
      getAdminWallet: jasmine.createSpy().and.resolveTo(details), adjust: jasmine.createSpy() };
    await TestBed.configureTestingModule({ imports: [AdminCredits], providers: [
      { provide: CreditsApiService, useValue: api }, { provide: AlertService, useValue: {} }
    ] }).compileComponents();
  });

  it('opens details in a dialog drawer without replacing or moving the directory', async () => {
    const fixture = TestBed.createComponent(AdminCredits); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const directory = fixture.nativeElement.querySelector('.directory');
    const trigger = fixture.nativeElement.querySelector('button.admin-btn-secondary') as HTMLButtonElement;
    trigger.click(); await fixture.whenStable(); fixture.detectChanges();
    const drawer = document.querySelector('.details-drawer') as HTMLElement;
    expect(drawer).not.toBeNull(); expect(drawer.getAttribute('role')).toBe('dialog');
    expect(drawer.textContent).toContain('Ada Teacher'); expect(directory.isConnected).toBeTrue();
    expect(api.getAdminWallet).toHaveBeenCalledWith('teacher-1', 1);
  });

  it('closes on Escape, restores focus, and preserves the directory state', async () => {
    const fixture = TestBed.createComponent(AdminCredits); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector('button.admin-btn-secondary') as HTMLButtonElement;
    trigger.click(); await fixture.whenStable(); fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve));
    expect(document.querySelector('.details-drawer')).toBeNull(); expect(document.activeElement).toBe(trigger);
    expect(fixture.componentInstance.directoryPage).toBe(1); expect(fixture.nativeElement.textContent).toContain('Ada Teacher');
  });

  it('renders an in-drawer error with retry', async () => {
    api.getAdminWallet.and.rejectWith({ error: { message: 'Temporary failure' } });
    const fixture = TestBed.createComponent(AdminCredits); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    (fixture.nativeElement.querySelector('button.admin-btn-secondary') as HTMLButtonElement).click(); await fixture.whenStable(); fixture.detectChanges();
    const drawer = document.querySelector('.details-drawer') as HTMLElement;
    expect(drawer.textContent).toContain('Temporary failure'); expect(drawer.textContent).toContain('Try again');
  });
});
