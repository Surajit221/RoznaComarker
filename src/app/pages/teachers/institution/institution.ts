import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { debounceTime, filter } from 'rxjs';
import { InstitutionApiService, type InstitutionContext, type InstitutionDashboard } from '../../../api/institution-api.service';
import { AccountStateService } from '../../../services/account-state.service';
import { AlertService } from '../../../services/alert.service';
import { NotificationRealtimeService } from '../../../services/notification-realtime.service';

@Component({ selector: 'app-institution', standalone: true, imports: [CommonModule, FormsModule],
  templateUrl: './institution.html', styleUrl: './institution.css' })
export class InstitutionPage {
  private api=inject(InstitutionApiService);private alerts=inject(AlertService);private realtime=inject(NotificationRealtimeService);
  private account=inject(AccountStateService);private destroyRef=inject(DestroyRef);
  context=signal<InstitutionContext|null>(null);dashboard=signal<InstitutionDashboard|null>(null);loading=signal(true);error=signal('');
  inviteEmail='';inviteRole='TEACHER';inviteBusy=signal(false);memberBusy=signal<string|null>(null);
  readonly isAdmin=()=>['INSTITUTION_OWNER','INSTITUTION_ADMIN'].includes(this.context()?.role||'');

  constructor(){this.realtime.events$.pipe(filter(event=>event.type==='institution_updated'),filter(event=>{
    const id=event.data?.institutionId,current=this.context()?.id;return !current||String(id)===String(current);
  }),debounceTime(180),takeUntilDestroyed(this.destroyRef)).subscribe(()=>void this.reload(false));}

  async ngOnInit(){this.realtime.connect();await this.reload();}
  async reload(showLoading=true){if(showLoading)this.loading.set(true);try{const context=await this.api.getMine();this.context.set(context);this.account.institution.set(context);
    this.dashboard.set(context&&['INSTITUTION_OWNER','INSTITUTION_ADMIN'].includes(context.role)?await this.api.dashboard():null);this.error.set('');
  }catch(e:any){this.error.set(e?.error?.message||'Institution workspace is unavailable.');}finally{this.loading.set(false)}}
  async invite(){const target=this.inviteEmail.trim();if(!target||this.inviteBusy())return;this.inviteBusy.set(true);try{const result=await this.api.invite(target,this.inviteRole);this.inviteEmail='';await this.reload(false);
    const expiry=result?.expiresAt?` The invitation expires ${new Date(result.expiresAt).toLocaleDateString()}.`:'';this.alerts.showSuccess('Invitation sent',`An institution invitation was sent to ${target}.${expiry}`);
  }catch(e:any){this.alerts.showError('Invitation failed',e?.error?.message||'The invitation could not be sent.');}finally{this.inviteBusy.set(false)}}
  async setLimit(memberId:string,input:HTMLInputElement){if(this.memberBusy())return;const raw=input.value.trim();const value=raw===''?null:Number(raw);
    if(value!==null&&(!Number.isInteger(value)||value<0)){this.alerts.showWarning('Invalid monthly limit','Enter a nonnegative whole number or leave the field blank for no limit.');return}
    this.memberBusy.set(memberId);try{await this.api.updateMember(memberId,value);await this.reload(false);this.alerts.showSuccess('Teacher limit updated',value===null?'The teacher now has no individual monthly limit.':`The teacher monthly limit is now ${value}.`);}
    catch(e:any){this.alerts.showError('Limit update failed',e?.error?.message||'The teacher limit could not be updated.');}finally{this.memberBusy.set(null)}}
  async remove(memberId:string){if(this.memberBusy())return;const confirmed=await this.alerts.showConfirm('Remove teacher?','Remove this teacher from the institution? Historical records will be preserved.','Remove teacher','Cancel');if(!confirmed)return;
    this.memberBusy.set(memberId);try{await this.api.removeMember(memberId);await this.reload(false);this.alerts.showSuccess('Teacher removed','The teacher has been removed from the institution. Historical records were preserved.');}
    catch(e:any){this.alerts.showError('Removal failed',e?.error?.message||'The teacher could not be removed.');}finally{this.memberBusy.set(null)}}
}
