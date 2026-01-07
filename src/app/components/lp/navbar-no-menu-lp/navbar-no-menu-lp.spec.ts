import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NavbarNoMenuLp } from './navbar-no-menu-lp';

describe('NavbarNoMenuLp', () => {
  let component: NavbarNoMenuLp;
  let fixture: ComponentFixture<NavbarNoMenuLp>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NavbarNoMenuLp]
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
