import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EssayImages } from './essay-images';

describe('EssayImages', () => {
  let component: EssayImages;
  let fixture: ComponentFixture<EssayImages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EssayImages]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EssayImages);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
