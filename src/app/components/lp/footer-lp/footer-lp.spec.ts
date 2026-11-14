import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FooterLp } from './footer-lp';
import { routedComponentProviders } from '../../../../testing/standalone-test-providers';

describe('FooterLp', () => {
  let component: FooterLp;
  let fixture: ComponentFixture<FooterLp>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FooterLp], providers: [...routedComponentProviders()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FooterLp);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the Rubrilo logo (icon + name) as ONE image (the on-teal variant on the teal footer), with no old brand', () => {
    const el = fixture.nativeElement as HTMLElement;
    const logo = el.querySelector<HTMLImageElement>('img[src="logo_and_icon/logo/rubrilo-logo-horizontal-on-teal@512w.png"]');
    expect(logo).withContext('logo rendered').not.toBeNull();
    expect(logo!.getAttribute('alt')).toBe('Rubrilo');
    expect([logo!.getAttribute('width'), logo!.getAttribute('height')]).toEqual(['512', '164']);
    expect(logo!.closest('a, h2')?.textContent?.trim()).withContext('no separate name text beside the logo').toBe('');
    expect(el.innerHTML).not.toContain('rubrilo-symbol');
    expect(el.textContent).toContain('by Rubrilo Team');
    expect(el.textContent).not.toMatch(/Rozna|Co-Marker/i);
  });
});
