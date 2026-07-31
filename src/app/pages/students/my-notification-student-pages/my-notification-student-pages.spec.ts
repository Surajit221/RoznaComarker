import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';

import { MyNotificationStudentPages } from './my-notification-student-pages';
import { authenticatedUserProviders, httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../testing/standalone-test-providers';

describe('MyNotificationStudentPages', () => {
  afterEach(verifyHttpRequestsAfterEach);
  let component: MyNotificationStudentPages;
  let fixture: ComponentFixture<MyNotificationStudentPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyNotificationStudentPages], providers: [...routedComponentProviders(), ...httpTestingProviders,
        ...authenticatedUserProviders('student')]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MyNotificationStudentPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('http://localhost:5000/api/notifications?limit=100')
      .flush({ success: true, data: [] });
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
