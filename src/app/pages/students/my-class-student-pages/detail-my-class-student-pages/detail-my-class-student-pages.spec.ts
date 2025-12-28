import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetailMyClassStudentPages } from './detail-my-class-student-pages';

describe('DetailMyClassStudentPages', () => {
  let component: DetailMyClassStudentPages;
  let fixture: ComponentFixture<DetailMyClassStudentPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailMyClassStudentPages]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DetailMyClassStudentPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
