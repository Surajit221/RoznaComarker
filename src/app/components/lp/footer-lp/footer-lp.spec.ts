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
});
