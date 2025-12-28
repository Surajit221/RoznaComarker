import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StudentProfilePages } from './student-profile-pages';

describe('StudentProfilePages', () => {
  let component: StudentProfilePages;
  let fixture: ComponentFixture<StudentProfilePages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudentProfilePages]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StudentProfilePages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
