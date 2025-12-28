import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MyClassesPages } from './my-classes-pages';

describe('MyClassesPages', () => {
  let component: MyClassesPages;
  let fixture: ComponentFixture<MyClassesPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyClassesPages]
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
