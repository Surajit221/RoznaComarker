import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { SourceFidelity } from './source-fidelity';
import { FullPageSourceReview } from './full-page-source-review';
type Item={reviewItemId:string;pageNumber:number;reasonCodes:string[];provisionalText:string;verificationState:string;canConfirm:boolean;cropAvailable:boolean};
type Review={sourceFidelity:SourceFidelity;revision:number;sourceHash:string;unavailable:number;items:Item[];pages?:{pageIndex:number;pageNumber:number}[]};
@Component({selector:'app-human-source-review',imports:[FormsModule,FullPageSourceReview],template:`
  <section class="review-panel" aria-label="Human source verification">
    <h3>Source verification required</h3>
    <p>{{ mandatoryFullPage ? "Review each page against the handwriting before scoring continues." : "Some handwriting could not be transcribed reliably. Confirm the exact visible text before scoring continues." }}</p>
    @if (!review) { <button type="button" class="btn-primary" [disabled]="busy" (click)="open()">{{ busy ? 'Preparing review…' : mandatoryFullPage ? 'Review page transcripts' : 'Review unresolved regions' }}</button> }
    @if (review) {
      <button type="button" class="btn-secondary" [disabled]="busy" (click)="open()">Refresh review</button>
      <p role="status">{{ review.sourceFidelity.humanReview?.unresolved || 0 }} unresolved · {{ review.sourceFidelity.humanReview?.resolved || 0 }} confirmed</p>
      @if (review.unavailable && !mandatoryFullPage) { <p role="alert">Some regions cannot be safely located. Teacher escalation is required; scoring remains blocked.</p> }
      @if (item; as current) {
        <p>Region {{ position + 1 }} of {{ pending.length }} · Page {{ current.pageNumber }}</p>
        @if (cropUrl) { <img [src]="cropUrl" alt="Handwriting region to transcribe" /> }
        <p>Provisional reading:</p><pre [textContent]="current.provisionalText || 'No safe provisional span is available.'"></pre>
        @if (!current.canConfirm) { <p role="alert">HUMAN_REVIEW_REGION_UNAVAILABLE: this region needs escalation. A safe source mapping is unavailable.</p> }
        <label for="source-role">Handwriting classification</label>
        <select id="source-role" [(ngModel)]="classification" [disabled]="busy">
          <option value="ACTIVE_STUDENT_TEXT">Active student text</option><option value="DELETED_STUDENT_TEXT">Crossed out / deleted</option>
          <option value="NON_STUDENT_ARTIFACT">Non-student artifact</option><option value="CANNOT_DETERMINE">Cannot determine</option>
        </select>
        <label for="source-literal">Exact visible text</label>
        <p id="literal-instruction">Type exactly what is visible. Do not fix spelling or grammar.</p>
        <textarea id="source-literal" rows="4" [(ngModel)]="text" maxlength="6000" spellcheck="false" autocorrect="off" autocapitalize="off" autocomplete="off" aria-describedby="literal-instruction" [disabled]="busy"></textarea>
        <details><summary>Deleted/crossed-out writing (optional)</summary><label for="source-deleted">Excluded text, kept separate from active writing</label>
          <textarea id="source-deleted" rows="2" [(ngModel)]="deletedText" maxlength="3000" spellcheck="false" autocorrect="off" autocapitalize="off" autocomplete="off" [disabled]="busy"></textarea></details>
        <div class="review-actions"><button type="button" class="btn-primary" [disabled]="busy || !current.canConfirm || !cropUrl" (click)="confirm()">{{ busy ? 'Saving…' : 'Confirm region' }}</button>
          <button type="button" class="btn-secondary" [disabled]="busy || pending.length < 2" (click)="next()">Next region</button></div>
      } @else { <p>All reviewable regions are confirmed. {{ review.sourceFidelity.assessmentAllowed ? 'Assessment is continuing.' : mandatoryFullPage ? 'Confirm each page below.' : 'Unresolved blockers still require escalation.' }}</p> }
    }
    @if (review?.pages?.length) { <app-full-page-source-review [submissionId]="submissionId" [pages]="review?.pages || []" [totalPages]="review?.sourceFidelity?.pages?.length || 0" [mandatory]="mandatoryFullPage" (resolved)="pageResolved($event)" (conflict)="pageConflict()" /> }
    @if (message) { <p role="alert">{{ message }}</p> }
  </section>`,styles:[`:host{display:block}.review-panel{border:1px solid #b9d4d1;border-radius:12px;padding:1rem;margin:1rem 0;background:#f5faf9}h3{font-size:1.1rem;font-weight:700}p{margin:.7rem 0}img{display:block;max-width:100%;height:auto;border:1px solid #d1dada}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit}label{display:block;font-weight:600;margin-top:1rem}textarea,select{width:100%;box-sizing:border-box;border:1px solid #94aaa7;border-radius:6px;padding:.65rem;background:white;color:#233b38}textarea{white-space:pre-wrap}button{min-height:44px;padding:.6rem 1rem}button:focus-visible,textarea:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #287d70;outline-offset:3px}.review-actions{display:flex;flex-wrap:wrap;gap:.7rem;margin-top:1rem}`]})
export class HumanSourceReview implements OnDestroy, OnChanges {
  @Input() submissionId=''; @Input() mandatoryFullPage=false; @Output() sourceChanged=new EventEmitter<SourceFidelity>();
  private http=inject(HttpClient);review:Review|null=null;busy=false;message='';position=0;cropUrl='';text='';deletedText='';classification='ACTIVE_STUDENT_TEXT';
  private epoch=0;
  ngOnChanges(){this.epoch++;this.clearCrop();this.review=null;this.busy=false;this.message='';this.position=0;}
  get pending(){return this.review?.items.filter(i=>!['HUMAN_VERIFIED','SUPERSEDED_BY_FULL_PAGE_HUMAN_VERIFICATION'].includes(i.verificationState))||[];}
  get item(){return this.pending[this.position];}
  private get base(){return `${environment.apiUrl}/submissions/${encodeURIComponent(this.submissionId)}/source-review`;}
  private clearCrop(){if(this.cropUrl)URL.revokeObjectURL(this.cropUrl);this.cropUrl='';}
  async open(){if(this.busy)return;const epoch=this.epoch;this.busy=true;this.message='';try{const r=await firstValueFrom(this.http.post<{data:Review}>(this.base,{}));if(epoch!==this.epoch)return;this.review=r.data;
    this.sourceChanged.emit(r.data.sourceFidelity);this.position=0;await this.loadCrop();}catch{if(epoch===this.epoch)this.message='Source review could not be opened. Check your teacher access and try again.';}finally{if(epoch===this.epoch)this.busy=false;}}
  private async loadCrop(){this.clearCrop();this.text=this.item?.provisionalText||'';this.deletedText='';this.classification='ACTIVE_STUDENT_TEXT';
    if(!this.item?.cropAvailable)return;const epoch=this.epoch;const blob=await firstValueFrom(this.http.get(`${this.base}/${this.item.reviewItemId}/crop`,{responseType:'blob'}));if(epoch===this.epoch)this.cropUrl=URL.createObjectURL(blob);}
  async next(){if(this.busy)return;this.busy=true;this.position=(this.position+1)%this.pending.length;try{await this.loadCrop();}catch{this.message='This crop is unavailable. Scoring remains blocked.';}finally{this.busy=false;}}
  async confirm(){if(this.busy||!this.review||!this.item||!this.item.canConfirm||!this.cropUrl)return;const epoch=this.epoch;this.busy=true;this.message='';
    try{const r=await firstValueFrom(this.http.post<{data:Review}>(`${this.base}/${this.item.reviewItemId}/resolve`,{
      revision:this.review.revision,sourceHash:this.review.sourceHash,classification:this.classification,text:this.text,deletedText:this.deletedText}));
      if(epoch!==this.epoch)return;this.review=r.data;this.sourceChanged.emit(r.data.sourceFidelity);this.position=0;await this.loadCrop();
    }catch{if(epoch===this.epoch){this.message='The source may have changed, or this region cannot be mapped safely. Reopen review before confirming again.';this.review=null;this.clearCrop();}}
    finally{if(epoch===this.epoch)this.busy=false;}}
  ngOnDestroy(){this.epoch++;this.clearCrop();}
  async pageResolved(review:Review){const epoch=++this.epoch;this.review=review;this.position=0;this.clearCrop();this.text='';this.sourceChanged.emit(review.sourceFidelity);
    this.busy=true;try{await this.loadCrop();}catch{if(epoch===this.epoch)this.message='This crop is unavailable. Scoring remains blocked.';}finally{if(epoch===this.epoch)this.busy=false;}}
  pageConflict(){this.review=null;this.clearCrop();this.message='The source may have changed. Refresh review before continuing.';}
}
