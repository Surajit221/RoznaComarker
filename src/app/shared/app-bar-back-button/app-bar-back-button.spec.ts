import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppBarBackButton } from './app-bar-back-button';

describe('AppBarBackButton', () => {
  let component: AppBarBackButton;
  let fixture: ComponentFixture<AppBarBackButton>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppBarBackButton]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AppBarBackButton);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
