import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JoinClassForm } from './join-class-form';
import { routedHttpTestProviders } from '../../../../testing/routed-http-test.providers';
import { HttpErrorResponse } from '@angular/common/http';
import { AlertService } from '../../../../services/alert.service';

describe('JoinClassForm', () => {
  let component: JoinClassForm;
  let fixture: ComponentFixture<JoinClassForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JoinClassForm],
      providers: routedHttpTestProviders()
    })
    .compileComponents();

    fixture = TestBed.createComponent(JoinClassForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the backend business message instead of the generic Angular error', async () => {
    component.joinCode = 'CLASS1';
    spyOn((component as any).membershipApi, 'joinClassByCode').and.rejectWith(new HttpErrorResponse({
      status: 403,
      error: { code: 'STUDENT_LIMIT_REACHED', message: 'Student limit reached for this account.' }
    }));
    const showError = spyOn(TestBed.inject(AlertService), 'showError');

    await component.onFindClass();

    expect(showError).toHaveBeenCalledWith('Failed to join class', 'Student limit reached for this account.');
  });
});
