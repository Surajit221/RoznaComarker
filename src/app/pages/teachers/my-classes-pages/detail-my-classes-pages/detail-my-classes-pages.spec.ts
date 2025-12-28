import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetailMyClassesPages } from './detail-my-classes-pages';

describe('DetailMyClassesPages', () => {
  let component: DetailMyClassesPages;
  let fixture: ComponentFixture<DetailMyClassesPages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailMyClassesPages]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DetailMyClassesPages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
