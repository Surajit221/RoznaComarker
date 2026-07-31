import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChartStorage } from './chart-storage';
import { routedComponentProviders } from '../../../testing/standalone-test-providers';

describe('ChartStorage', () => {
  let component: ChartStorage;
  let fixture: ComponentFixture<ChartStorage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChartStorage], providers: [...routedComponentProviders()]
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
