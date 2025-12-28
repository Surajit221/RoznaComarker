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
});
