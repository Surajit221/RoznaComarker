import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MyProfileStudentPages } from './my-profile-student-pages';

describe('MyProfileStudentPages', () => {
  let component: MyProfileStudentPages;
  let fixture: ComponentFixture<MyProfileStudentPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyProfileStudentPages]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MyProfileStudentPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
