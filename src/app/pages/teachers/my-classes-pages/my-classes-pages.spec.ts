import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MyClassesPages } from './my-classes-pages';
import { routedHttpTestProviders } from '../../../testing/routed-http-test.providers';

describe('MyClassesPages', () => {
  let component: MyClassesPages;
  let fixture: ComponentFixture<MyClassesPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyClassesPages],
      providers: routedHttpTestProviders()
    })
    .compileComponents();

    fixture = TestBed.createComponent(MyClassesPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
