import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MyClassesCard } from './my-classes-card';
import { DeviceService } from '../../../services/device.service';

describe('MyClassesCard', () => {
  let component: MyClassesCard;
  let fixture: ComponentFixture<MyClassesCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyClassesCard],
      providers: [{ provide: DeviceService, useValue: { isDesktop: () => true, isMobile: () => false, isTablet: () => false } }]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MyClassesCard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('uses the equal-height body, reserved description, and bottom footer structure', () => {
    component.description = '';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.teacher-class-card')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.teacher-class-card__body')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.teacher-class-card__description')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.teacher-class-card__footer')).not.toBeNull();
  });
});
