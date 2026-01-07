import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TncPpLayout } from './tnc-pp-layout';

describe('TncPpLayout', () => {
  let component: TncPpLayout;
  let fixture: ComponentFixture<TncPpLayout>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TncPpLayout]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TncPpLayout);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
