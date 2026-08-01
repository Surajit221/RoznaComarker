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

  it('reorders the authoritative selected-file array before upload', () => {
    const introduction = new File(['intro'], 'introduction.jpg', { type: 'image/jpeg' });
    const continuation = new File(['next'], 'continuation.jpg', { type: 'image/jpeg' });
    component.files = [
      { file: continuation, name: continuation.name, size: continuation.size },
      { file: introduction, name: introduction.name, size: introduction.size }
    ];
    let emitted: File[] = [];
    component.filesSelected.subscribe((files) => { emitted = files; });

    component.moveFile(new Event('click'), 1, -1);

    expect(component.files.map((entry) => entry.name)).toEqual(['introduction.jpg', 'continuation.jpg']);
    expect(emitted).toEqual([introduction, continuation]);
  });
});
