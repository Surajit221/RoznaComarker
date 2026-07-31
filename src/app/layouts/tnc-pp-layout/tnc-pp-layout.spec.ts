import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TncPpLayout } from './tnc-pp-layout';
import { routedComponentProviders } from '../../../testing/standalone-test-providers';

describe('TncPpLayout', () => {
  let component: TncPpLayout;
  let fixture: ComponentFixture<TncPpLayout>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TncPpLayout], providers: [...routedComponentProviders()]
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
