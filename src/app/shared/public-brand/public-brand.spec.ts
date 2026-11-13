import { TestBed } from '@angular/core/testing';
import { PublicBrand } from './public-brand';

describe('PublicBrand', () => {
  it('shows the Rubrilo horizontal logo as one image, centred, not as a link', async () => {
    await TestBed.configureTestingModule({ imports: [PublicBrand] }).compileComponents();
    const fixture = TestBed.createComponent(PublicBrand);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const brand = root.querySelector('.public-brand') as HTMLElement;
    const img = brand.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('logo_and_icon/logo/rubrilo-logo-horizontal-fullcolor@512w.png');
    expect(img.getAttribute('alt')).toBe('Rubrilo');
    expect([img.getAttribute('width'), img.getAttribute('height')]).toEqual(['512', '164']);
    expect(brand.querySelectorAll('img').length).toBe(1);
    expect(brand.textContent?.trim()).toBe('');              // no separate wordmark: the name is in the image
    expect(getComputedStyle(brand).justifyContent).toBe('center');
    expect(root.querySelector('a')).toBeNull();
  });
});
