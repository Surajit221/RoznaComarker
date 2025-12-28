import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JoinClassForm } from './join-class-form';

describe('JoinClassForm', () => {
  let component: JoinClassForm;
  let fixture: ComponentFixture<JoinClassForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JoinClassForm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(JoinClassForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
