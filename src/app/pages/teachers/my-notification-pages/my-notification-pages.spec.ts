import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';

import { MyNotificationPages } from './my-notification-pages';
import { authenticatedUserProviders, httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../testing/standalone-test-providers';

describe('MyNotificationPages', () => {
  afterEach(verifyHttpRequestsAfterEach);
  let component: MyNotificationPages;
  let fixture: ComponentFixture<MyNotificationPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyNotificationPages], providers: [...routedComponentProviders(), ...httpTestingProviders,
        ...authenticatedUserProviders('teacher')]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MyNotificationPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('http://localhost:5000/api/notifications?limit=100')
      .flush({ success: true, data: [] });
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
