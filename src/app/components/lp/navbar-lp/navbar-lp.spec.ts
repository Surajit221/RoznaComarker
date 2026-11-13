import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NavbarLp } from './navbar-lp';
import { routedComponentProviders } from '../../../../testing/standalone-test-providers';

describe('NavbarLp', () => {
  let component: NavbarLp;
  let fixture: ComponentFixture<NavbarLp>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NavbarLp], providers: [...routedComponentProviders()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NavbarLp);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the Rubrilo logo (icon + name) as ONE image, with no old brand', () => {
    const el = fixture.nativeElement as HTMLElement;
    const logo = el.querySelector<HTMLImageElement>('img[src="logo_and_icon/logo/rubrilo-logo-horizontal-fullcolor@512w.png"]');
    expect(logo).withContext('logo rendered').not.toBeNull();
    expect(logo!.getAttribute('alt')).toBe('Rubrilo');
    expect([logo!.getAttribute('width'), logo!.getAttribute('height')]).toEqual(['512', '164']);
    expect(logo!.closest('a, h2')?.textContent?.trim()).withContext('no separate name text beside the logo').toBe('');
    expect(el.innerHTML).not.toContain('rubrilo-symbol');
    expect(el.textContent).not.toMatch(/Rozna|Co-Marker/i);
  });
});
