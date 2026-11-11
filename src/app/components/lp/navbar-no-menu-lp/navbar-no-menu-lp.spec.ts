import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NavbarNoMenuLp } from './navbar-no-menu-lp';
import { routedComponentProviders } from '../../../../testing/standalone-test-providers';

describe('NavbarNoMenuLp', () => {
  let component: NavbarNoMenuLp;
  let fixture: ComponentFixture<NavbarNoMenuLp>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NavbarNoMenuLp], providers: [...routedComponentProviders()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NavbarNoMenuLp);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the Rubrilo symbol next to the Rubrilo name, with no old brand', () => {
    const el = fixture.nativeElement as HTMLElement;
    const logo = el.querySelector<HTMLImageElement>('img[src="logo_and_icon/rubrilo-symbol-full.svg"]');
    expect(logo).withContext('symbol rendered').not.toBeNull();
    expect(logo!.getAttribute('alt')).withContext('decorative next to the visible name').toBe('');
    expect(logo!.closest('a, h2')?.textContent?.trim()).toContain('Rubrilo');
    expect(el.textContent).not.toMatch(/Rozna|Co-Marker/i);
  });
});
