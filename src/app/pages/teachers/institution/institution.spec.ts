import { signal } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { InstitutionApiService } from '../../../api/institution-api.service';
import { AccountStateService } from '../../../services/account-state.service';
import { AlertService } from '../../../services/alert.service';
import { NotificationRealtimeService } from '../../../services/notification-realtime.service';
import { InstitutionPage } from './institution';

describe('InstitutionPage role-aware workspace',()=>{
  let api:any;let events:Subject<any>;
  const member:any={id:'inst-1',name:'Rozna School',status:'ACTIVE',role:'TEACHER',managedByInstitution:true,sharedCreditRemaining:900,myUsage:10,myLimit:20,cycleStart:'2026-09-01',cycleEnd:'2026-10-01'};
  beforeEach(async()=>{events=new Subject();api={getMine:jasmine.createSpy().and.resolveTo(member),dashboard:jasmine.createSpy()};await TestBed.configureTestingModule({imports:[InstitutionPage],providers:[
    {provide:InstitutionApiService,useValue:api},{provide:NotificationRealtimeService,useValue:{events$:events.asObservable(),connect:jasmine.createSpy()}},
    {provide:AccountStateService,useValue:{institution:signal(null)}},{provide:AlertService,useValue:{showSuccess:jasmine.createSpy(),showError:jasmine.createSpy(),showWarning:jasmine.createSpy(),showConfirm:jasmine.createSpy()}}
  ]}).compileComponents()});
  it('renders member context without calling the admin dashboard',async()=>{const fixture=TestBed.createComponent(InstitutionPage);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();expect(api.dashboard).not.toHaveBeenCalled();expect(fixture.nativeElement.textContent).toContain('Rozna School');expect(fixture.nativeElement.textContent).toContain('Shared credits remaining');expect(fixture.nativeElement.textContent).toContain('20');expect(fixture.nativeElement.textContent).not.toContain('Invite a teacher')});
  it('coalesces matching institution invalidations into one authoritative reload',fakeAsync(()=>{const fixture=TestBed.createComponent(InstitutionPage);fixture.detectChanges();tick();api.getMine.calls.reset();events.next({type:'institution_updated',data:{institutionId:'inst-1'}});events.next({type:'institution_updated',data:{institutionId:'inst-1'}});tick(179);expect(api.getMine).not.toHaveBeenCalled();tick(1);expect(api.getMine).toHaveBeenCalledTimes(1)}));
});
