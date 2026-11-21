// Stage 10b regression pin: the ESSAY guest page is unchanged now that speaking guests exist. The essay QR address and the essay result page
// still use the essay endpoints only, show the essay wording and controls, and nothing from the speaking guest page (no notice to accept, no
// recording picker, no speaking endpoint). The essay routes still point at the essay page.
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { GuestSubmissionPage } from './guest-submission';
import { AuthService } from '../../../auth/auth.service';
import { GuestSubmissionFeature } from '../../../services/guest-submission-feature.service';
import { routes } from '../../../app.routes';
import { environment } from '../../../../environments/environment';

const API = `${environment.apiUrl}/guest`;
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

describe('essay guest page: unchanged by speaking guests (stage 10b pin)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  function setup(params: Record<string, string>, fragment: string | null = null) {
    TestBed.configureTestingModule({ imports: [GuestSubmissionPage], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: AuthService, useValue: { ensureQrBackendSession: jasmine.createSpy().and.resolveTo({ state: 'anonymous' }), hasFirebaseIdentity: () => false } },
      { provide: GuestSubmissionFeature, useValue: { enabled: () => true, load: () => Promise.resolve(true) } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(params), fragment } } }] });
    spyOn(history, 'replaceState');
    const fixture = TestBed.createComponent(GuestSubmissionPage);
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    return { fixture, http: TestBed.inject(HttpTestingController), root: fixture.nativeElement as HTMLElement };
  }

  it('the essay QR address: the essay entry endpoint, the essay wording and fields; no speaking notice, picker or endpoint', async () => {
    const { fixture, http, root } = setup({ qrToken: 'share-code' });
    fixture.detectChanges(); await settle();
    http.expectOne(`${API}/assignments/share-code`).flush({ data: { title: 'River essay', allowGuestSubmission: true } });
    await settle(); fixture.detectChanges();
    expect(root.querySelector('.guest-badge')?.textContent?.trim()).toBe('Guest Submission');
    expect(root.textContent).toContain('Submit your work');
    expect(root.textContent).toContain('Add your details and upload your writing.');
    expect(root.querySelector('#guest-name')).not.toBeNull();
    expect(root.querySelector('[data-consent]')).toBeNull();
    expect(root.querySelector('app-speaking-upload-picker')).toBeNull();
    http.expectNone(r => r.url.includes('/speaking'));
  });

  it('the essay result address still reads the essay presentation endpoint (never the speaking one)', async () => {
    const { fixture, http } = setup({ submissionId: 'e'.repeat(24) }, 'k'.repeat(43));
    fixture.detectChanges(); await settle();
    const req = http.expectOne(`${API}/submissions/${'e'.repeat(24)}/presentation`);
    expect(req.request.headers.get('X-Guest-Token')).toBe('k'.repeat(43));
    http.expectNone(r => r.url.includes('/speaking'));
    req.flush({ success: false }, { status: 410, statusText: 'Gone' });
    await settle();
  });

});

describe('the essay guest routes (stage 10b pin)', () => {
  it('the essay routes still open the essay page; the speaking guest routes are separate addresses', () => {
    const paths = routes.map(route => route.path);
    expect(paths).toContain('student/assignments/qr/:qrToken');
    expect(paths).toContain('guest/results/:submissionId');
    expect(paths).toContain('student/assignments/qr/:qrToken/speaking');
    expect(paths).toContain('guest/speaking/:submissionId');
    expect(paths.indexOf('student/assignments/qr/:qrToken')).toBeLessThan(paths.indexOf('student/assignments/qr/:qrToken/speaking'));
  });
});
