import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MyProfileStudentPages } from './my-profile-student-pages';
import { authenticatedUserProviders, httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../testing/standalone-test-providers';

describe('MyProfileStudentPages', () => {
  afterEach(verifyHttpRequestsAfterEach);
  let component: MyProfileStudentPages;
  let fixture: ComponentFixture<MyProfileStudentPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyProfileStudentPages], providers: [...routedComponentProviders(), ...httpTestingProviders,
        ...authenticatedUserProviders('student')]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MyProfileStudentPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
