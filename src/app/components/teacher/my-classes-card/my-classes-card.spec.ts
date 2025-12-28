import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MyClassesCard } from './my-classes-card';

describe('MyClassesCard', () => {
  let component: MyClassesCard;
  let fixture: ComponentFixture<MyClassesCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyClassesCard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MyClassesCard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
