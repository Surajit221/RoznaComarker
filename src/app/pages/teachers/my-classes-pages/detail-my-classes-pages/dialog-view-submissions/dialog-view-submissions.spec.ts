import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DialogViewSubmissions } from './dialog-view-submissions';

describe('DialogViewSubmissions', () => {
  let component: DialogViewSubmissions;
  let fixture: ComponentFixture<DialogViewSubmissions>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogViewSubmissions]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DialogViewSubmissions);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
