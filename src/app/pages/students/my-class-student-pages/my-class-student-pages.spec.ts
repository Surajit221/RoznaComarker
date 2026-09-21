import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { HttpErrorResponse } from '@angular/common/http';

import { MyClassStudentPages } from './my-class-student-pages';
import { httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../testing/standalone-test-providers';
import { MembershipApiService } from '../../../api/membership-api.service';
import { AlertService } from '../../../services/alert.service';

describe('MyClassStudentPages', () => {
  afterEach(verifyHttpRequestsAfterEach);
  let component: MyClassStudentPages;
  let fixture: ComponentFixture<MyClassStudentPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyClassStudentPages], providers: [...routedComponentProviders(), ...httpTestingProviders]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MyClassStudentPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('http://localhost:5000/api/memberships/mine')
      .flush({ success: true, data: [] });
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows a safe retryable message when My Classes loses the backend connection', async () => {
    await fixture.whenStable();
    const membershipApi = TestBed.inject(MembershipApiService);
    const alert = TestBed.inject(AlertService);
    spyOn(membershipApi, 'getMyMemberships').and.rejectWith(new HttpErrorResponse({
      status: 0, statusText: 'Unknown Error', url: 'https://comarkerback.roznahub.com/api/memberships/mine'
    }));
    const shown = spyOn(alert, 'showError');

    await component.loadClasses();

    expect(shown).toHaveBeenCalledWith('Failed to load classes',
      'Unable to reach the server. Check your connection and try again.');
    expect(shown.calls.mostRecent().args[1]).not.toContain('https://');
  });
});
