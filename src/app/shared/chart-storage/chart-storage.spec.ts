import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChartStorage } from './chart-storage';

describe('ChartStorage', () => {
  let component: ChartStorage;
  let fixture: ComponentFixture<ChartStorage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChartStorage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChartStorage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
