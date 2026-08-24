import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DialogQrClasses } from './dialog-qr-classes';

describe('DialogQrClasses', () => {
  let component: DialogQrClasses;
  let fixture: ComponentFixture<DialogQrClasses>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogQrClasses]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogQrClasses);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows and copies an assignment link when enabled', async () => {
    component.qrValue = 'https://example.test/student/assignments/qr/token-1';
    component.showShareLink = true;
    const writeText = jasmine.createSpy('writeText').and.resolveTo();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('#assignment-share-link').value).toBe(component.qrValue);
    await component.copyShareLink();
    expect(writeText).toHaveBeenCalledOnceWith(component.qrValue);
  });
});
