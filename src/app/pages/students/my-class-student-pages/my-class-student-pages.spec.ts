import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MyClassStudentPages } from './my-class-student-pages';

describe('MyClassStudentPages', () => {
  let component: MyClassStudentPages;
  let fixture: ComponentFixture<MyClassStudentPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyClassStudentPages]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MyClassStudentPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
