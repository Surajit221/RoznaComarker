// Stage 10b: the recovery portal lists speaking work with kind 'speaking'. A guest recording opens the guest speaking page; a speaking row on the
// student's account stays "Sign in to view". Essay rows are pinned: same markup, same target page, no speaking label.
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { RecoveryPortalPage } from './recovery-portal';
import { environment } from '../../../environments/environment';

const TOKEN = 'T'.repeat(43), SESSION = 'S'.repeat(43);
const API = `${environment.apiUrl}/recovery`;
const ESSAY = { id: 'a'.repeat(24), assignmentTitle: 'Essay A', className: 'Writing 7B', submittedAt: '2026-10-01T10:00:00.000Z', status: 'ready' };
const SPEAKING = { id: 'c'.repeat(24), assignmentTitle: 'Describe your town', className: 'Writing 7B', submittedAt: '2026-10-03T10:00:00.000Z', status: 'processing',
  kind: 'speaking' };
const ACCOUNT_SPEAKING = { id: 'account-1', access: 'signIn', assignmentTitle: 'Talk about food', className: 'Writing 7B', submittedAt: '2026-10-04T10:00:00.000Z',
  kind: 'speaking' };

async function listed(items: unknown[]) {
  sessionStorage.removeItem('comarker:recovery-session');
  TestBed.configureTestingModule({ imports: [RecoveryPortalPage],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { fragment: TOKEN, data: { mode: 'portal' } } } }] });
  spyOn(history, 'replaceState');
  const fixture = TestBed.createComponent(RecoveryPortalPage);
  const http = TestBed.inject(HttpTestingController);
  const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  fixture.detectChanges();
  http.expectOne(`${API}/exchange`).flush({ success: true, data: { session: SESSION, expiresAt: new Date(Date.now() + 1800000).toISOString() } });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  http.expectOne(`${API}/assignments`).flush({ success: true, data: { assignments: items } });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  fixture.detectChanges();
  return { fixture, navigate, root: fixture.nativeElement as HTMLElement };
}

describe('RecoveryPortalPage: speaking rows (stage 10b)', () => {
  afterEach(() => { TestBed.inject(HttpTestingController).verify(); sessionStorage.removeItem('comarker:recovery-session'); });

  it('a guest recording opens the guest speaking page and says it is a speaking assignment', async () => {
    const { root, navigate } = await listed([SPEAKING, ESSAY]);
    const [speakingRow] = Array.from(root.querySelectorAll<HTMLButtonElement>('button.portal-item'));
    expect(speakingRow.querySelector('[data-kind-speaking]')?.textContent?.trim()).toBe('Speaking');
    speakingRow.click();
    expect(navigate).toHaveBeenCalledWith(['/guest/speaking', 'c'.repeat(24)]);
  });

  it('an essay row is unchanged: no kind label, it opens the essay result page', async () => {
    const { root, navigate } = await listed([ESSAY]);
    const row = root.querySelector<HTMLButtonElement>('button.portal-item')!;
    expect(row.querySelector('[data-kind-speaking]')).toBeNull();
    expect(row.textContent).toContain('Feedback ready');
    row.click();
    expect(navigate).toHaveBeenCalledWith(['/guest/results', 'a'.repeat(24)]);
  });

  it('speaking work on the student account stays "Sign in to view" (a sign-in link, never a guest page)', async () => {
    const { root, navigate } = await listed([ACCOUNT_SPEAKING]);
    const link = root.querySelector<HTMLAnchorElement>('a[data-sign-in]')!;
    expect(link.textContent).toContain('Sign in to view');
    expect(link.querySelector('[data-kind-speaking]')?.textContent?.trim()).toBe('Speaking');
    expect(link.getAttribute('href')).toBe('/login');
    expect(root.querySelector('button.portal-item')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});
