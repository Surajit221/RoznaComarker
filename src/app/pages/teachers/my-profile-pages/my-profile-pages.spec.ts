import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';

import { MyProfilePages } from './my-profile-pages';
import { authenticatedUserProviders, httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../testing/standalone-test-providers';

describe('MyProfilePages', () => {
  afterEach(verifyHttpRequestsAfterEach);
  let component: MyProfilePages;
  let fixture: ComponentFixture<MyProfilePages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyProfilePages], providers: [...routedComponentProviders(), ...httpTestingProviders,
        ...authenticatedUserProviders('teacher')]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MyProfilePages);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await Promise.resolve();
    TestBed.inject(HttpTestingController).expectOne('http://localhost:5000/api/classes/mine')
      .flush({ success: true, data: [] });
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
