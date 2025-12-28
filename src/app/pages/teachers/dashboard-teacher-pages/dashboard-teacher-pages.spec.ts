import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DashboardTeacherPages } from './dashboard-teacher-pages';

describe('DashboardTeacherPages', () => {
  let component: DashboardTeacherPages;
  let fixture: ComponentFixture<DashboardTeacherPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardTeacherPages]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DashboardTeacherPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
