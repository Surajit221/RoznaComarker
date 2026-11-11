import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LandingPage } from './landing-page';

describe('LandingPage', () => {
  let component: LandingPage;
  let fixture: ComponentFixture<LandingPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingPage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LandingPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads the Rubrilo hero eagerly with its real size and a WebP source', () => {
    const hero = fixture.nativeElement.querySelector('#home picture img') as HTMLImageElement;
    expect(hero.getAttribute('src')).toBe('img/landing/rubrilo-dashboard-hero.png');
    expect(hero.getAttribute('width')).toBe('1637');
    expect(hero.getAttribute('height')).toBe('961');
    expect(hero.getAttribute('loading')).toBe('eager');
    expect(hero.getAttribute('fetchpriority')).toBe('high');
    expect(hero.alt).toContain('Rubrilo');
    expect(fixture.nativeElement.querySelector('#home picture source[type="image/webp"]').getAttribute('srcset'))
      .toBe('img/landing/rubrilo-dashboard-hero.webp');
  });

  it('shows the four step screenshots in one shared 3:2 frame', () => {
    const frames = [...fixture.nativeElement.querySelectorAll('#how-it-works figure')] as HTMLElement[];
    expect(frames.length).toBe(4);
    const names = ['step-01-create-class', 'step-02-upload-essay', 'step-03-ai-analysis', 'step-04-review'];
    frames.forEach((frame, i) => {
      expect(frame.classList).toContain('landing-step-shot');
      const img = frame.querySelector('img') as HTMLImageElement;
      expect(img.getAttribute('src')).toBe(`img/landing/${names[i]}.png`);
      expect(img.getAttribute('width')).toBe('1500');
      expect(img.getAttribute('height')).toBe('1000');
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.alt.length).toBeGreaterThan(20);
      // Phones get their own tighter crop, so the text stays legible at a phone's image width.
      const [phone, phonePng, wide] = [...frame.querySelectorAll('source')];
      expect(phone.getAttribute('media')).toBe('(max-width: 767px)');
      expect(phone.getAttribute('srcset')).toBe(`img/landing/${names[i]}-phone.webp 720w, img/landing/${names[i]}-phone@2x.webp 1200w`);
      expect(phonePng.getAttribute('media')).toBe('(max-width: 767px)');
      expect(phonePng.getAttribute('srcset')).toBe(`img/landing/${names[i]}-phone.png`);
      expect(wide.getAttribute('media')).toBeNull();
      expect(wide.getAttribute('srcset')).toBe(`img/landing/${names[i]}.webp 1500w, img/landing/${names[i]}@2x.webp 3000w`);
      expect(wide.getAttribute('sizes')).toBe('(min-width: 1280px) 720px, 760px');
      const style = getComputedStyle(frame);
      expect(style.aspectRatio).toBe('3 / 2');
      expect(getComputedStyle(img).objectFit).toBe('cover');
      expect(getComputedStyle(img).objectPosition).toBe('50% 0%');
    });
    const radii = new Set(frames.map(f => getComputedStyle(f).borderTopLeftRadius));
    expect(radii.size).toBe(1);
  });

  it('no longer points at the old RoznaHub screenshots', () => {
    const sources = [...fixture.nativeElement.querySelectorAll('img, source')]
      .map((el: Element) => `${el.getAttribute('src') || ''} ${el.getAttribute('srcset') || ''}`).join(' ');
    for (const old of ['hero-banner.png', 'create-new-class-screen.png', 'upload-essay-screen.png', 'steps/ai-analyze.png', 'steps/feedback.png']) {
      expect(sources).not.toContain(old);
    }
  });
});
