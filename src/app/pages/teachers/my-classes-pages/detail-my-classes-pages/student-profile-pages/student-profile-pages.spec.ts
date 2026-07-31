import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StudentProfilePages } from './student-profile-pages';
import { authenticatedUserProviders, httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../../../testing/standalone-test-providers';

describe('StudentProfilePages', () => {
  afterEach(verifyHttpRequestsAfterEach);
  let component: StudentProfilePages;
  let fixture: ComponentFixture<StudentProfilePages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudentProfilePages], providers: [...routedComponentProviders(), ...httpTestingProviders,
        ...authenticatedUserProviders('teacher')]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StudentProfilePages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
