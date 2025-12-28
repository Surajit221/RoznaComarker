import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DashboardStudentPages } from './dashboard-student-pages';

describe('DashboardStudentPages', () => {
  let component: DashboardStudentPages;
  let fixture: ComponentFixture<DashboardStudentPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardStudentPages]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DashboardStudentPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
