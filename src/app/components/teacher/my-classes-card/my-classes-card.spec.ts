import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MyClassesCard } from './my-classes-card';
import { DeviceService } from '../../../services/device.service';

describe('MyClassesCard', () => {
  let component: MyClassesCard;
  let fixture: ComponentFixture<MyClassesCard>;
  let desktop: boolean;
  let mobile: boolean;

  beforeEach(async () => {
    desktop = true;
    mobile = false;
    await TestBed.configureTestingModule({
      imports: [MyClassesCard],
      providers: [{ provide: DeviceService, useValue: {
        isDesktop: () => desktop,
        isMobile: () => mobile,
        isTablet: () => false
      } }]
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

  it('shows the archived badge and emits restore without blocking navigation support', () => {
    component.id = 'class-1';
    component.title = 'History';
    component.status = 'archived';
    spyOn(component.restoreRequested, 'emit');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Archived');
    component.onRestoreClick(new Event('click'));
    expect(component.restoreRequested.emit).toHaveBeenCalledWith({ id: 'class-1', title: 'History' });
  });

  it('emits archive for an active class', () => {
    component.id = 'class-2';
    component.title = 'Current';
    spyOn(component.archiveRequested, 'emit');
    component.onArchiveClick(new Event('click'));
    expect(component.archiveRequested.emit).toHaveBeenCalledWith({ id: 'class-2', title: 'Current' });
  });

  it('renders each active desktop action once and emits archive once per click', () => {
    component.id = 'class-2';
    component.status = 'active';
    component.menuOpen = true;
    spyOn(component.archiveRequested, 'emit');
    fixture.detectChanges();

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    expect(buttons.map(button => button.textContent?.trim())).toEqual(['Update', 'Archive', 'Delete']);

    buttons[1].click();
    expect(component.archiveRequested.emit).toHaveBeenCalledTimes(1);
  });

  it('renders the archived desktop restore action once and emits once per click', () => {
    component.id = 'class-1';
    component.status = 'archived';
    component.menuOpen = true;
    spyOn(component.restoreRequested, 'emit');
    fixture.detectChanges();

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    expect(buttons.map(button => button.textContent?.trim())).toEqual(['Restore Class']);

    buttons[0].click();
    expect(component.restoreRequested.emit).toHaveBeenCalledTimes(1);
  });

  it('uses the same exact active and archived actions in the responsive menu', () => {
    desktop = false;
    mobile = true;
    component.status = 'active';
    component.menuOpen = true;
    fixture.detectChanges();

    let buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    expect(buttons.map(button => button.textContent?.trim())).toEqual(['Update', 'Archive', 'Delete']);

    component.status = 'archived';
    fixture.detectChanges();
    buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    expect(buttons.map(button => button.textContent?.trim())).toEqual(['Restore Class']);
  });
});
