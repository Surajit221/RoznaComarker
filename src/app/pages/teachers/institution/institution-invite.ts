import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { InstitutionApiService } from '../../../api/institution-api.service';
import { AccountStateService } from '../../../services/account-state.service';
import { AlertService } from '../../../services/alert.service';

@Component({ selector:'app-institution-invite',standalone:true,templateUrl:'./institution-invite.html',styleUrl:'./institution-invite.css' })
export class InstitutionInvitePage {
  private route=inject(ActivatedRoute);private router=inject(Router);private api=inject(InstitutionApiService);
  private account=inject(AccountStateService);private alerts=inject(AlertService);
  busy=signal(false);done=signal(false);error=signal('');errorCode=signal('');
  async accept(){if(this.busy())return;const token=this.route.snapshot.paramMap.get('token')||'';if(!token){this.showError('INVITE_INVALID','This invitation link is invalid.');return}
    this.busy.set(true);this.error.set('');try{const result=await this.api.accept(token);const context=await this.account.refreshInstitution();this.done.set(true);
      const name=context?.name||result.institutionName||'the institution';this.alerts.showSuccess('Invitation accepted',`You've joined ${name}.`);await this.router.navigate(['/teacher/institution'],{replaceUrl:true});
    }catch(e:any){this.showError(e?.error?.code,e?.error?.message);}finally{this.busy.set(false)}}
  private showError(code:string,message:string){this.errorCode.set(code||'INVITE_FAILED');const safe:Record<string,string>={INVITE_EMAIL_MISMATCH:'Sign in with the email address this invitation was sent to.',INVITE_EXPIRED:'This invitation has expired. Ask an institution administrator for a new invitation.',INVITE_INVALID:'This invitation is invalid or has already been used.',ACTIVE_INSTITUTION_EXISTS:'This account already belongs to an active institution.',SEAT_LIMIT_REACHED:'This institution has no available seats.'};this.error.set(safe[code]||message||'This invitation cannot be accepted.');}
}
