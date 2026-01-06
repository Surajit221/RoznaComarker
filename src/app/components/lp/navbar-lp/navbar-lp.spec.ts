import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NavbarLp } from './navbar-lp';

describe('NavbarLp', () => {
  let component: NavbarLp;
  let fixture: ComponentFixture<NavbarLp>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NavbarLp]
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
