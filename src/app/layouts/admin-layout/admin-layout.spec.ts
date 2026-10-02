import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AdminLayout, ADMIN_NAV_ITEMS } from './admin-layout';
import { AuthService } from '../../auth/auth.service';
import { AdminGuard } from '../../auth/admin.guard';
import { clearPrivateAuthStorage } from '../../auth/backend-token.util';

@Component({ standalone: true, template: '<p>Route content</p>' })
class RouteStub {}

describe('AdminLayout', () => {
  let logout: jasmine.Spy;
  beforeEach(async () => {
    logout = jasmine.createSpy('logout').and.resolveTo();
    await TestBed.configureTestingModule({
      imports: [AdminLayout],
      providers: [{ provide: AuthService, useValue: { logout } }, provideRouter([
        { path: 'login', component: RouteStub },
        { path: 'admin/billing', component: RouteStub, canActivate: [AdminGuard] },
        { path: 'admin/credits', component: RouteStub },
        { path: 'admin/pricing', component: RouteStub },
      ])],
    }).compileComponents();
  });

  afterEach(() => { document.body.style.overflow = ''; clearPrivateAuthStorage(); });

  it('renders every legitimate Admin route from one navigation configuration', async () => {
    const fixture = TestBed.createComponent(AdminLayout);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/admin/credits');
    await fixture.whenStable(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    const links = [...fixture.nativeElement.querySelectorAll('.admin-navigation a')] as HTMLAnchorElement[];
    expect(links.map((link) => link.textContent?.trim())).toEqual(ADMIN_NAV_ITEMS.map((item) => item.label));
    expect(links[0].classList.contains('active')).toBeTrue();
    expect(links[0].getAttribute('aria-current')).toBe('page');
  });

  it('opens and closes the drawer, locks scrolling, and supports backdrop and Escape', () => {
    const fixture = TestBed.createComponent(AdminLayout); fixture.detectChanges();
    const component = fixture.componentInstance;
    component.openDrawer(); fixture.detectChanges();
    expect(component.drawerOpen()).toBeTrue();
    expect(document.body.style.overflow).toBe('hidden');
    (fixture.nativeElement.querySelector('.drawer-backdrop') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(component.drawerOpen()).toBeFalse();
    expect(document.body.style.overflow).toBe('');
    component.openDrawer(); component.onEscape(); fixture.detectChanges();
    expect(component.drawerOpen()).toBeFalse();
  });

  it('closes an open drawer after navigation', async () => {
    const fixture = TestBed.createComponent(AdminLayout); fixture.detectChanges();
    fixture.componentInstance.openDrawer();
    await TestBed.inject(Router).navigateByUrl('/admin/pricing');
    fixture.detectChanges();
    expect(fixture.componentInstance.drawerOpen()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.page-heading').textContent).toContain('Pricing Configuration');
  });

  it('does not introduce horizontal overflow at supported widths', () => {
    const fixture = TestBed.createComponent(AdminLayout); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    for (const width of [320, 360, 375, 390, 412, 430, 768, 1024]) {
      host.style.width = `${width}px`;
      fixture.detectChanges();
      expect(host.scrollWidth).withContext(`${width}px viewport`).toBeLessThanOrEqual(host.clientWidth);
    }
  });

  it('shows a real Logout button and keeps Back to RoznaHub as navigation', () => {
    const fixture = TestBed.createComponent(AdminLayout); fixture.detectChanges();
    const footer = fixture.nativeElement.querySelector('.sidebar-footer') as HTMLElement;
    const button = footer.querySelector('button') as HTMLButtonElement;
    expect(button.type).toBe('button');
    expect(button.textContent?.trim()).toBe('Logout');
    expect(button.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(footer.querySelector('a')?.textContent).toContain('Back to RoznaHub');
    (footer.querySelector('a') as HTMLAnchorElement).click();
    expect(logout).not.toHaveBeenCalled();
  });

  it('uses the existing auth logout once and redirects to login', async () => {
    let release!: () => void;
    logout.and.returnValue(new Promise<void>(resolve => { release = resolve; }));
    const fixture = TestBed.createComponent(AdminLayout); fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.sidebar-footer button') as HTMLButtonElement;
    button.click(); fixture.detectChanges();
    expect(button.disabled).toBeTrue();
    expect(button.textContent).toContain('Logging out');
    button.click();
    await fixture.componentInstance.logout();
    expect(logout).toHaveBeenCalledTimes(1);
    release(); await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('clears the admin view on auth sign-out failure using the existing safe logout contract', async () => {
    logout.and.rejectWith(new Error('provider failure'));
    const fixture = TestBed.createComponent(AdminLayout); fixture.detectChanges();
    await fixture.componentInstance.logout();
    expect(logout).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('blocks direct admin navigation and browser back after central logout clears the token', async () => {
    const payload = btoa(JSON.stringify({ role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 }));
    localStorage.setItem('backend_jwt', `e30.${payload}.signature`);
    logout.and.callFake(async () => { clearPrivateAuthStorage(); });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/admin/billing');
    const fixture = TestBed.createComponent(AdminLayout); fixture.detectChanges();
    await fixture.componentInstance.logout();
    expect(router.url).toBe('/login');
    await router.navigateByUrl('/admin/billing');
    expect(router.url).toBe('/login?redirect=%2Fadmin%2Fbilling');
    expect(localStorage.getItem('backend_jwt')).toBeNull();
  });

  it('keeps Logout reachable through the mobile drawer at every supported width', () => {
    const fixture = TestBed.createComponent(AdminLayout); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    for (const width of [1440, 1024, 768, 430, 390, 375]) {
      host.style.width = `${width}px`;
      fixture.componentInstance.openDrawer(); fixture.detectChanges();
      const button = host.querySelector('.sidebar-footer button') as HTMLButtonElement;
      expect(button).not.toBeNull();
      expect(button.disabled).toBeFalse();
      expect(host.scrollWidth).withContext(`${width}px`).toBeLessThanOrEqual(host.clientWidth);
      fixture.componentInstance.closeDrawer(false);
    }
  });
});
