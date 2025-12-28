import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MySubmissionPage } from './my-submission-page';

describe('MySubmissionPage', () => {
  let component: MySubmissionPage;
  let fixture: ComponentFixture<MySubmissionPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MySubmissionPage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MySubmissionPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
