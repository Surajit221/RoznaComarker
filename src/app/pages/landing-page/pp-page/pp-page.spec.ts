import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PpPage } from './pp-page';

describe('PpPage', () => {
  let component: PpPage;
  let fixture: ComponentFixture<PpPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PpPage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PpPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
