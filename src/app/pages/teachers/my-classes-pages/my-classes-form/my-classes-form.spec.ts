import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MyClassesForm } from './my-classes-form';
import { routedHttpTestProviders } from '../../../../testing/routed-http-test.providers';

describe('MyClassesForm', () => {
  let component: MyClassesForm;
  let fixture: ComponentFixture<MyClassesForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyClassesForm],
      providers: routedHttpTestProviders()
    })
    .compileComponents();

    fixture = TestBed.createComponent(MyClassesForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
