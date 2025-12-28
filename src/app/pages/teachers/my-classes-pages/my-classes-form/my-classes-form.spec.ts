import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MyClassesForm } from './my-classes-form';

describe('MyClassesForm', () => {
  let component: MyClassesForm;
  let fixture: ComponentFixture<MyClassesForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyClassesForm]
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
