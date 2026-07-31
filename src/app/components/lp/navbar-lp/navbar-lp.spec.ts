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
});
