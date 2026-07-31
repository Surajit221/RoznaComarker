import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AssignmentForm } from './assignment-form';
import { httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../../../testing/standalone-test-providers';

describe('AssignmentForm', () => {
  afterEach(verifyHttpRequestsAfterEach);
  let component: AssignmentForm;
  let fixture: ComponentFixture<AssignmentForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssignmentForm], providers: [...routedComponentProviders(), ...httpTestingProviders]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AssignmentForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
