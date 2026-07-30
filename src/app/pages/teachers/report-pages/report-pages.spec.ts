import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReportPages } from './report-pages';
import { routedHttpTestProviders } from '../../../testing/routed-http-test.providers';

describe('ReportPages', () => {
  let component: ReportPages;
  let fixture: ComponentFixture<ReportPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportPages],
      providers: routedHttpTestProviders()
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReportPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
