import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BottomsheetDialog } from './bottomsheet-dialog';

describe('BottomsheetDialog', () => {
  let component: BottomsheetDialog;
  let fixture: ComponentFixture<BottomsheetDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BottomsheetDialog]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BottomsheetDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('closes from the backdrop and Escape by default; not while dismissible is false (e.g. files uploading)', () => {
    const closed = jasmine.createSpy('closed');
    component.closed.subscribe(closed);
    component.close(); component.onEscape();
    expect(closed).toHaveBeenCalledTimes(2);
    closed.calls.reset();
    component.dismissible = false;
    component.close(); component.onEscape();
    expect(closed).not.toHaveBeenCalled();
  });
});
