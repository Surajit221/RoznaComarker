import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UploadEssayForm } from './upload-essay-form';

describe('UploadEssayForm', () => {
  let component: UploadEssayForm;
  let fixture: ComponentFixture<UploadEssayForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UploadEssayForm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(UploadEssayForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
