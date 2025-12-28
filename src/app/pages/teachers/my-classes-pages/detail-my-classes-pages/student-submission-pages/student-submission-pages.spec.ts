import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StudentSubmissionPages } from './student-submission-pages';

describe('StudentSubmissionPages', () => {
  let component: StudentSubmissionPages;
  let fixture: ComponentFixture<StudentSubmissionPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudentSubmissionPages]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StudentSubmissionPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
