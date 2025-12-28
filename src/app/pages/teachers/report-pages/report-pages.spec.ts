import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReportPages } from './report-pages';

describe('ReportPages', () => {
  let component: ReportPages;
  let fixture: ComponentFixture<ReportPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportPages]
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
