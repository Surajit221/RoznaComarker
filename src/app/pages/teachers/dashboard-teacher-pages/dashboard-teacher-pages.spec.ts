import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';

import { DashboardTeacherPages } from './dashboard-teacher-pages';
import { authenticatedUserProviders, httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../testing/standalone-test-providers';

describe('DashboardTeacherPages', () => {
  afterEach(verifyHttpRequestsAfterEach);
  let component: DashboardTeacherPages;
  let fixture: ComponentFixture<DashboardTeacherPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardTeacherPages], providers: [...routedComponentProviders(), ...httpTestingProviders,
        ...authenticatedUserProviders('teacher')]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DashboardTeacherPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('http://localhost:5000/api/classes/mine?status=active')
      .flush({ success: true, data: [] });
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
