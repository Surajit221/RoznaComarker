import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MyNotificationPages } from './my-notification-pages';

describe('MyNotificationPages', () => {
  let component: MyNotificationPages;
  let fixture: ComponentFixture<MyNotificationPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyNotificationPages]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MyNotificationPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
