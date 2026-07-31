import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';

import { DashboardStudentPages } from './dashboard-student-pages';
import { authenticatedUserProviders, httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../testing/standalone-test-providers';

describe('DashboardStudentPages', () => {
  afterEach(verifyHttpRequestsAfterEach);
  let component: DashboardStudentPages;
  let fixture: ComponentFixture<DashboardStudentPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardStudentPages], providers: [...routedComponentProviders(), ...httpTestingProviders,
        ...authenticatedUserProviders('student')]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DashboardStudentPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('http://localhost:5000/api/memberships/mine').flush({ success: true, data: [] });
    http.expectOne('http://localhost:5000/api/assignments/my').flush({ success: true, data: [] });
    http.expectOne('http://localhost:5000/api/submissions/my').flush({ success: true, data: [] });
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
