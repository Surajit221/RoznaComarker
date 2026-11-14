import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { RecoveryPortalPage } from './recovery-portal';
import { RecoveryPortalService } from '../../services/recovery-portal.service';
import { GuestStudentAccess } from '../../services/guest-student-access.service';
import { environment } from '../../../environments/environment';

const TOKEN = 'T'.repeat(43), SESSION = 'S'.repeat(43);
const API = `${environment.apiUrl}/recovery`;
const ITEMS = [
  { id: 'a'.repeat(24), assignmentTitle: 'Essay A', className: 'Writing 7B', submittedAt: '2026-10-01T10:00:00.000Z', status: 'ready' },
  { id: 'b'.repeat(24), assignmentTitle: 'Essay B', className: 'Writing 7B', submittedAt: '2026-10-02T10:00:00.000Z', status: 'processing' },
];

function setup(mode: 'portal' | 'request', fragment: string | null) {
  sessionStorage.removeItem('comarker:recovery-session');
  TestBed.configureTestingModule({
    imports: [RecoveryPortalPage],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { fragment, data: { mode } } } }],
  });
  const replace = spyOn(history, 'replaceState');
  const fixture = TestBed.createComponent(RecoveryPortalPage);
  const http = TestBed.inject(HttpTestingController);
  const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  return { fixture, page: fixture.componentInstance, http, replace, navigate };
}
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const text = (fixture: { nativeElement: HTMLElement }) => fixture.nativeElement.textContent || '';

describe('RecoveryPortalPage', () => {
  afterEach(() => { TestBed.inject(HttpTestingController).verify(); sessionStorage.removeItem('comarker:recovery-session'); });

  it('removes the token from the address bar before any request, exchanges it once, then lists the submissions', async () => {
    const { fixture, page, http, replace } = setup('portal', TOKEN);
    fixture.detectChanges();
    expect(page.state).toBe('loading');
    expect(replace).toHaveBeenCalledTimes(1);
    expect(String(replace.calls.mostRecent().args[2])).not.toContain('#');
    expect(String(replace.calls.mostRecent().args[2])).not.toContain(TOKEN);
    const exchange = http.expectOne(`${API}/exchange`);
    expect(exchange.request.method).toBe('POST');
    expect(exchange.request.body).toEqual({ token: TOKEN });
    exchange.flush({ success: true, data: { session: SESSION, expiresAt: new Date(Date.now() + 1800000).toISOString() } });
    await settle();
    const list = http.expectOne(`${API}/assignments`);
    expect(list.request.headers.get('X-Recovery-Session')).toBe(SESSION);
    list.flush({ success: true, data: { assignments: ITEMS } });
    await settle(); fixture.detectChanges();
    expect(page.state).toBe('list');
    const buttons = fixture.nativeElement.querySelectorAll('button.portal-item');
    expect(buttons.length).toBe(2);
    expect(text(fixture)).toContain('Essay A');
    expect(text(fixture)).toContain('Feedback ready');
    expect(text(fixture)).toContain('Being marked');
    expect(sessionStorage.getItem('comarker:recovery-session')).not.toContain(TOKEN);   // only the session is kept
  });

  it('opens the chosen assignment in the normal guest result page', async () => {
    const { fixture, http, navigate } = setup('portal', TOKEN);
    fixture.detectChanges();
    http.expectOne(`${API}/exchange`).flush({ success: true, data: { session: SESSION, expiresAt: new Date(Date.now() + 1800000).toISOString() } });
    await settle();
    http.expectOne(`${API}/assignments`).flush({ success: true, data: { assignments: ITEMS } });
    await settle(); fixture.detectChanges();
    (fixture.nativeElement.querySelectorAll('button.portal-item')[1] as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith(['/guest/results', 'b'.repeat(24)]);
  });

  it('account work is listed as "Sign in to view" (title, class, date; no status), links to sign-in, and never opens a guest result', async () => {
    const { fixture, http, navigate } = setup('portal', TOKEN);
    fixture.detectChanges();
    http.expectOne(`${API}/exchange`).flush({ success: true, data: { session: SESSION, expiresAt: new Date(Date.now() + 1800000).toISOString() } });
    await settle();
    http.expectOne(`${API}/assignments`).flush({ success: true, data: { assignments: [...ITEMS,
      { id: 'account-1', access: 'signIn', assignmentTitle: 'Member Essay', className: 'Member Class', submittedAt: '2026-10-03T10:00:00.000Z' }] } });
    await settle(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('button.portal-item').length).toBe(2);
    const row = fixture.nativeElement.querySelector('a[data-sign-in]') as HTMLAnchorElement;
    expect(row.textContent).toContain('Member Essay');
    expect(row.textContent).toContain('Member Class');
    expect(row.textContent).toContain('Sign in to view');
    expect(row.textContent).not.toMatch(/Feedback ready|Being marked|Needs attention/);
    expect(row.getAttribute('href')).toBe('/login');
    expect(fixture.nativeElement.querySelector('[data-sign-in-note]')!.textContent).toContain('sign in with this email address');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('without account work there is no sign-in note', async () => {
    const { fixture, http } = setup('portal', TOKEN);
    fixture.detectChanges();
    http.expectOne(`${API}/exchange`).flush({ success: true, data: { session: SESSION, expiresAt: new Date(Date.now() + 1800000).toISOString() } });
    await settle();
    http.expectOne(`${API}/assignments`).flush({ success: true, data: { assignments: ITEMS } });
    await settle(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-sign-in-note]')).toBeNull();
    expect(fixture.nativeElement.querySelector('a[data-sign-in]')).toBeNull();
  });

  it('shows the invalid state (with a way to get a new link) for an expired or revoked link', async () => {
    const { fixture, page, http } = setup('portal', TOKEN);
    fixture.detectChanges();
    http.expectOne(`${API}/exchange`).flush({ success: false, code: 'RECOVERY_LINK_INVALID' }, { status: 410, statusText: 'Gone' });
    await settle(); fixture.detectChanges();
    expect(page.state).toBe('invalid');
    expect(text(fixture)).toContain('expired');
    (fixture.nativeElement.querySelector('button.secondary-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(page.state).toBe('request');
    expect(fixture.nativeElement.querySelector('#portal-email')).not.toBeNull();
  });

  it('a malformed token is invalid without any request, and is still removed from the URL', () => {
    const { fixture, page, replace } = setup('portal', 'not-a-token');
    fixture.detectChanges();
    expect(replace).toHaveBeenCalled();
    expect(page.state).toBe('invalid');
  });

  it('shows the empty state when the address has nothing open', async () => {
    const { fixture, page, http } = setup('portal', TOKEN);
    fixture.detectChanges();
    http.expectOne(`${API}/exchange`).flush({ success: true, data: { session: SESSION, expiresAt: new Date(Date.now() + 1800000).toISOString() } });
    await settle();
    http.expectOne(`${API}/assignments`).flush({ success: true, data: { assignments: [] } });
    await settle(); fixture.detectChanges();
    expect(page.state).toBe('empty');
    expect(text(fixture)).toContain('No submissions to show');
  });

  it('shows a retryable error state when the server is unavailable, and retries', async () => {
    const { fixture, page, http } = setup('portal', TOKEN);
    fixture.detectChanges();
    http.expectOne(`${API}/exchange`).flush({ success: true, data: { session: SESSION, expiresAt: new Date(Date.now() + 1800000).toISOString() } });
    await settle();
    http.expectOne(`${API}/assignments`).flush({}, { status: 503, statusText: 'Unavailable' });
    await settle(); fixture.detectChanges();
    expect(page.state).toBe('error');
    (fixture.nativeElement.querySelector('button.secondary-button') as HTMLButtonElement).click();
    http.expectOne(`${API}/assignments`).flush({ success: true, data: { assignments: ITEMS } });
    await settle();
    expect(page.state).toBe('list');
  });

  it('after a refresh (no token in the URL), an unexpired session lists again without a new exchange', async () => {
    sessionStorage.setItem('comarker:recovery-session', JSON.stringify({ session: SESSION, until: Date.now() + 600000 }));
    TestBed.configureTestingModule({
      imports: [RecoveryPortalPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { fragment: null, data: { mode: 'portal' } } } }],
    });
    const fixture = TestBed.createComponent(RecoveryPortalPage), http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    await settle();
    http.expectOne(`${API}/assignments`).flush({ success: true, data: { assignments: ITEMS } });
    await settle();
    expect(fixture.componentInstance.state).toBe('list');
  });

  it('without a token or a session the link is treated as invalid', () => {
    const { fixture, page } = setup('portal', null);
    fixture.detectChanges();
    expect(page.state).toBe('invalid');
  });

  it('sets Referrer-Policy no-referrer while the page is open, and removes it afterwards', () => {
    const { fixture } = setup('request', null);
    fixture.detectChanges();
    expect(document.head.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe('no-referrer');
    fixture.destroy();
    expect(document.head.querySelector('meta[name="referrer"]')).toBeNull();
  });

  it('request form: validates, sends the email, and shows the generic answer', async () => {
    const { fixture, page, http } = setup('request', null);
    fixture.detectChanges();
    expect(page.state).toBe('request');
    expect((fixture.nativeElement as HTMLElement).querySelector('.intro')?.textContent)
      .toContain('Enter the email address your teacher used or you used when submitting.');
    page.email = 'nope';
    await page.requestLink();
    expect(page.requestError).toBe('Enter the email address your teacher used or you used when submitting.');
    page.email = ' student@example.com ';
    const pending = page.requestLink();
    const req = http.expectOne(`${API}/request`);
    expect(req.request.body).toEqual({ email: 'student@example.com' });
    req.flush({ success: true, data: { message: 'If we find submissions for this email address, we will send a link.' } });
    await pending;
    expect(page.requestMessage).toContain('If we find submissions');
  });

  it('request form: a rate-limited answer says to wait', async () => {
    const { fixture, page, http } = setup('request', null);
    fixture.detectChanges();
    page.email = 'student@example.com';
    const pending = page.requestLink();
    http.expectOne(`${API}/request`).flush({}, { status: 429, statusText: 'Too Many Requests' });
    await pending;
    expect(page.requestError).toContain('wait');
  });
});

describe('GuestStudentAccess with a portal session', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), GuestStudentAccess] }));
  afterEach(() => sessionStorage.removeItem('comarker:recovery-session'));

  it('uses the submission link token when present, otherwise the portal session, otherwise nothing', () => {
    const access = TestBed.inject(GuestStudentAccess);
    expect(access.headers.keys()).toEqual([]);
    sessionStorage.setItem('comarker:recovery-session', JSON.stringify({ session: SESSION, until: Date.now() + 600000 }));
    expect(access.headers.get('X-Recovery-Session')).toBe(SESSION);
    access.token = TOKEN;
    expect(access.headers.get('X-Guest-Token')).toBe(TOKEN);
    expect(access.headers.has('X-Recovery-Session')).toBeFalse();
  });

  it('ignores an expired or corrupted stored session', () => {
    const access = TestBed.inject(GuestStudentAccess), portal = TestBed.inject(RecoveryPortalService);
    sessionStorage.setItem('comarker:recovery-session', JSON.stringify({ session: SESSION, until: Date.now() - 1 }));
    expect(access.headers.keys()).toEqual([]);
    sessionStorage.setItem('comarker:recovery-session', '{bad json');
    expect(portal.session()).toBe('');
  });
});
