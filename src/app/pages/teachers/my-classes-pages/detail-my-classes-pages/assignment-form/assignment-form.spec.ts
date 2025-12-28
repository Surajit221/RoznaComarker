import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssignmentForm } from './assignment-form';

describe('AssignmentForm', () => {
  let component: AssignmentForm;
  let fixture: ComponentFixture<AssignmentForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssignmentForm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AssignmentForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
