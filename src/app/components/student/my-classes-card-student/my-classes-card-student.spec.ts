import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MyClassesCardStudent } from './my-classes-card-student';
import { DeviceService } from '../../../services/device.service';

describe('MyClassesCardStudent', () => {
  let component: MyClassesCardStudent;
  let fixture: ComponentFixture<MyClassesCardStudent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyClassesCardStudent],
      providers: [{ provide: DeviceService, useValue: { isDesktop: () => true, isMobile: () => false, isTablet: () => false } }]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MyClassesCardStudent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  function menuEvent(): Event {
    return jasmine.createSpyObj<Event>('event', ['preventDefault', 'stopPropagation']);
  }

  it('opens and closes its menu without propagating the card click', () => {
    const event = menuEvent();
    component.joinCode = 'ABC123';
    component.onMenuClick(event);
    fixture.detectChanges();

    expect(component.menuOpen).toBeTrue();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="menu"]').textContent).toContain('View Class');
    expect(fixture.nativeElement.querySelector('[role="menu"]').textContent).toContain('Copy Class Code');

    component.onDocumentClick();
    expect(component.menuOpen).toBeFalse();
  });

  it('reuses the existing student class-detail navigation', () => {
    component.id = 'class-1';
    component.menuOpen = true;
    const event = menuEvent();
    const navigate = spyOn((component as any).router, 'navigate');

    component.onViewClass(event);

    expect(navigate).toHaveBeenCalledWith(['/student/my-classes/detail/', 'class-1']);
    expect(component.menuOpen).toBeFalse();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('copies the existing student-readable class code and confirms it', async () => {
    component.joinCode = 'ABC123';
    component.menuOpen = true;
    const event = menuEvent();
    const write = spyOn<any>(component, 'writeClipboard').and.resolveTo();
    const toast = spyOn((component as any).alert, 'showToast');

    await component.onCopyClassCode(event);

    expect(write).toHaveBeenCalledOnceWith('ABC123');
    expect(toast).toHaveBeenCalledOnceWith('Class code copied', 'success');
    expect(component.menuOpen).toBeFalse();
    expect(event.stopPropagation).toHaveBeenCalled();
  });
});
