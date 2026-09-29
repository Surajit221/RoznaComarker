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

  it('opens an image-only picker without submitting, while retaining PDF selection', () => {
    const imagePicker = component.imageInput.nativeElement;
    const allFilesPicker = component.fileInput.nativeElement;
    const open = spyOn(imagePicker, 'click');

    component.openImagePicker();

    expect(open).toHaveBeenCalledTimes(1);
    expect(imagePicker.accept).toContain('image/png');
    expect(imagePicker.accept).not.toContain('pdf');
    expect(allFilesPicker.accept).toContain('application/pdf');

    const pdf = new File(['%PDF-1.4'], 'essay.pdf', { type: 'application/pdf' });
    const selection = new DataTransfer();
    selection.items.add(pdf);
    component.onFilesSelected({ target: { files: selection.files, value: '' } } as unknown as Event);
    expect(component.files.map((entry) => entry.name)).toEqual(['essay.pdf']);
  });

  it('does not add a PDF selected through the image-only control', () => {
    const pdf = new File(['%PDF-1.4'], 'essay.pdf', { type: 'application/pdf' });
    const selection = new DataTransfer();
    selection.items.add(pdf);
    component.onImagesSelected({ target: { files: selection.files, value: '' } } as unknown as Event);
    expect(component.files).toEqual([]);
    expect(component.validationError).toContain('JPG and PNG');
  });

  it('keeps multiple images selected and rejects unsupported or oversized files', () => {
    const first = new File(['first'], 'first.jpg', { type: 'image/jpeg' });
    const second = new File(['second'], 'second.png', { type: 'image/png' });
    const images = new DataTransfer();
    images.items.add(first);
    images.items.add(second);
    const selected: File[][] = [];
    component.filesSelected.subscribe((files) => selected.push(files));

    component.onFilesSelected({ target: { files: images.files, value: '' } } as unknown as Event);
    expect(selected.at(-1)).toEqual([first, second]);
    expect(component.files.map((entry) => entry.name)).toEqual(['first.jpg', 'second.png']);

    const invalid = new DataTransfer();
    invalid.items.add(new File(['text'], 'notes.txt', { type: 'text/plain' }));
    const oversized = new File(['x'], 'large.jpg', { type: 'image/jpeg' });
    Object.defineProperty(oversized, 'size', { value: 10 * 1024 * 1024 + 1 });
    invalid.items.add(oversized);
    component.onFilesSelected({ target: { files: invalid.files, value: '' } } as unknown as Event);
    expect(component.files.map((entry) => entry.name)).toEqual(['first.jpg', 'second.png']);
    expect(component.validationError).toContain('Only JPG, PNG, and PDF');
  });

  it('respects the existing 20-file upload limit', () => {
    component.files = Array.from({ length: 20 }, (_, i) => {
      const file = new File(['page'], `page-${i}.pdf`, { type: 'application/pdf' });
      return { file, name: file.name, size: file.size };
    });
    const more = new DataTransfer();
    more.items.add(new File(['extra'], 'extra.pdf', { type: 'application/pdf' }));
    component.onFilesSelected({ target: { files: more.files, value: '' } } as unknown as Event);
    expect(component.files.length).toBe(20);
    expect(component.validationError).toContain('20 files');
  });
});
