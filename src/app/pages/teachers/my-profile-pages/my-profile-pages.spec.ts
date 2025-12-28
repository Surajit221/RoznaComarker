import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MyProfilePages } from './my-profile-pages';

describe('MyProfilePages', () => {
  let component: MyProfilePages;
  let fixture: ComponentFixture<MyProfilePages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyProfilePages]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MyProfilePages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
