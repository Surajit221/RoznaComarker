import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetailMyClassesPages } from './detail-my-classes-pages';
import { authenticatedUserProviders, httpTestingProviders, routedComponentProviders, verifyHttpRequestsAfterEach } from '../../../../../testing/standalone-test-providers';

describe('DetailMyClassesPages', () => {
  afterEach(verifyHttpRequestsAfterEach);
  let component: DetailMyClassesPages;
  let fixture: ComponentFixture<DetailMyClassesPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailMyClassesPages], providers: [...routedComponentProviders(), ...httpTestingProviders,
        ...authenticatedUserProviders('teacher')]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DetailMyClassesPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
