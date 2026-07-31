import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';

import { MyClassStudentPages } from './my-class-student-pages';
import { httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../testing/standalone-test-providers';

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
});
