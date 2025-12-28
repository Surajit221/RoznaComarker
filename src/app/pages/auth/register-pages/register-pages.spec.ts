import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RegisterPages } from './register-pages';

describe('RegisterPages', () => {
  let component: RegisterPages;
  let fixture: ComponentFixture<RegisterPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterPages]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RegisterPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
