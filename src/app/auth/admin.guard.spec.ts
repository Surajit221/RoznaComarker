import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  let guard: AdminGuard; let router: Router;
  const token = (role: string) => `${btoa('{}')}.${btoa(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`;
  beforeEach(() => { TestBed.configureTestingModule({ providers: [provideRouter([])] }); guard = TestBed.inject(AdminGuard); router = TestBed.inject(Router); });
  afterEach(() => localStorage.removeItem('backend_jwt'));

  it('allows an authenticated admin to open /admin/pricing', () => {
    localStorage.setItem('backend_jwt', token('admin'));
    expect(guard.canActivate({}, { url: '/admin/pricing' } as any)).toBe(true);
  });
  it('redirects an unauthenticated visitor to login with the pricing return URL', () => {
    const result = guard.canActivate({}, { url: '/admin/pricing' } as any);
    expect(router.serializeUrl(result as any)).toBe('/login?redirect=%2Fadmin%2Fpricing');
  });
  it('rejects an authenticated non-admin', () => {
    localStorage.setItem('backend_jwt', token('teacher'));
    expect(router.serializeUrl(guard.canActivate({}, { url: '/admin/pricing' } as any) as any)).toBe('/');
  });
});
