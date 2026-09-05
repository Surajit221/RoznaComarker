import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AdminLayout, ADMIN_NAV_ITEMS } from './admin-layout';

@Component({ standalone: true, template: '<p>Route content</p>' })
class RouteStub {}

describe('AdminLayout', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminLayout],
      providers: [provideRouter([
        { path: 'admin/credits', component: RouteStub },
        { path: 'admin/pricing', component: RouteStub },
      ])],
    }).compileComponents();
  });

  afterEach(() => { document.body.style.overflow = ''; });

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
});
