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
});
