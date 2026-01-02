import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LandingPageLayout } from './landing-page-layout';

describe('LandingPageLayout', () => {
  let component: LandingPageLayout;
  let fixture: ComponentFixture<LandingPageLayout>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingPageLayout]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LandingPageLayout);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
