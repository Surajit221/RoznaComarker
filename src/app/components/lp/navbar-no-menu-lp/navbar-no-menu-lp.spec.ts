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
});
