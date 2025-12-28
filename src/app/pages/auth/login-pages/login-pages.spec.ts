import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoginPages } from './login-pages';

describe('LoginPages', () => {
  let component: LoginPages;
  let fixture: ComponentFixture<LoginPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginPages]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LoginPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
