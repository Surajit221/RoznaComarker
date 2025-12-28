import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RubricForm } from './rubric-form';

describe('RubricForm', () => {
  let component: RubricForm;
  let fixture: ComponentFixture<RubricForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RubricForm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RubricForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
