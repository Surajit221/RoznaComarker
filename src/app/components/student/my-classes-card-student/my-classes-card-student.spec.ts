import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MyClassesCardStudent } from './my-classes-card-student';

describe('MyClassesCardStudent', () => {
  let component: MyClassesCardStudent;
  let fixture: ComponentFixture<MyClassesCardStudent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyClassesCardStudent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MyClassesCardStudent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
