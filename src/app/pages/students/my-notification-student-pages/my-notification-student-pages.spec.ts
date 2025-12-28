import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MyNotificationStudentPages } from './my-notification-student-pages';

describe('MyNotificationStudentPages', () => {
  let component: MyNotificationStudentPages;
  let fixture: ComponentFixture<MyNotificationStudentPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyNotificationStudentPages]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MyNotificationStudentPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
