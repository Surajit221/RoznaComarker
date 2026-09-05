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

  it('filters the existing notification stream without changing its order', () => {
    const notification = (id: string, category: 'ACTION_REQUIRED' | 'STUDENT_PROGRESS' | 'REWARD') => ({
      _id: id, recipient: 'teacher', type: 'test', category, priority: 'NORMAL' as const,
      title: id, description: id, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
    });
    component.notifications = [
      notification('action', 'ACTION_REQUIRED'),
      notification('progress', 'STUDENT_PROGRESS'),
      notification('reward', 'REWARD')
    ];

    component.filter = 'STUDENT_PROGRESS';

    expect(component.filteredNotifications.map((item) => item._id)).toEqual(['progress']);
    component.filter = 'ALL';
    expect(component.filteredNotifications.map((item) => item._id)).toEqual(['action', 'progress', 'reward']);
  });
});
