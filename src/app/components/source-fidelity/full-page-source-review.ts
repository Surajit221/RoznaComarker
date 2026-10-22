import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type PageReview={pageIndex:number;pageNumber:number;pageHash:string;pageIdentity:string;sourceHash:string;revision:number;eligible:boolean;provisionalTranscript:string;uncertainSpans?:{visibleContext:string|null;reason:string}[]};
@Component({selector:'app-full-page-source-review',imports:[FormsModule],template:`
  @if (pages.length) {
    <section aria-label="Full page source review" class="escalation">
      <p>{{ mandatory ? "Confirm every page before assessment can continue." : "Some handwriting regions cannot be safely mapped automatically. Review the full page and enter the exact visible active text." }}</p>
      <p role="status">{{ pageCount - pages.length }} confirmed / {{ pageCount }} pages; {{ pages.length }} unconfirmed</p>
        @for (candidate of pages; track candidate.pageIndex) {
          <button type="button" class="btn-secondary" [disabled]="busy" (click)="open(candidate.pageIndex)">Review full page transcription · Page {{ candidate.pageIndex + 1 }}</button>
        }
      @if (page) {
        <h4>Full page transcription · Page {{ page.pageIndex + 1 }} of {{ pageCount }}</h4>
        @if (imageUrl) { <a [href]="imageUrl" target="_blank" rel="noopener">Open image at full size</a><img [src]="imageUrl" alt="Original page to review in full" /> }
        <label for="full-page-role">Review decision</label>
        <select id="full-page-role" [(ngModel)]="classification" [disabled]="busy"><option value="ACTIVE_PAGE_TRANSCRIPT">Confirm complete active transcript</option><option value="CANNOT_DETERMINE">Cannot determine</option></select>
        <label for="full-page-literal">Provisional OCR — review every line before confirming.</label>
        <p id="full-page-instruction">Review the transcript against the handwriting. Type exactly what is visible. Do not fix spelling or grammar. Exclude crossed-out/deleted text.</p>
        @if (page.uncertainSpans?.length) { <details><summary>Handwriting to check carefully</summary>@for (span of page.uncertainSpans; track $index) { <p [textContent]="span.visibleContext || span.reason"></p> }</details> }
        <textarea id="full-page-literal" rows="16" maxlength="50000" [(ngModel)]="text" [disabled]="busy" spellcheck="false" autocorrect="off" autocomplete="off" autocapitalize="off" aria-describedby="full-page-instruction"></textarea>
        <label class="check"><input type="checkbox" [(ngModel)]="reviewedDeletedMaterial" [disabled]="busy" /> I inspected deleted/crossed-out writing and excluded it from the active transcript.</label>
        <label class="check"><input type="checkbox" [(ngModel)]="confirmed" [disabled]="busy" /> I reviewed the entire original page and confirm this is the exact visible active text, including spelling and grammar errors.</label>
        <div class="actions"><button type="button" class="btn-primary" [disabled]="busy || !imageUrl || (classification === 'ACTIVE_PAGE_TRANSCRIPT' && !confirmed)" (click)="save()">{{ busy ? 'Saving…' : classification === 'CANNOT_DETERMINE' ? 'Keep source blocked' : 'Confirm page transcript' }}</button>
        <button type="button" class="btn-secondary" [disabled]="busy" (click)="cancel()">Cancel</button></div>
      }
      @if (message) { <p role="alert">{{ message }}</p> }
    </section>
  }`,styles:[`.escalation{margin-top:1.5rem;padding-top:1rem;border-top:1px solid #94aaa7}img{display:block;max-width:100%;height:auto;margin:.75rem 0}label{display:block;font-weight:600;margin:1rem 0 .4rem}textarea,select{width:100%;box-sizing:border-box;border:1px solid #94aaa7;border-radius:6px;padding:.65rem;background:white;color:#233b38}textarea{white-space:pre-wrap;font:inherit}.check{font-weight:400;display:flex;align-items:flex-start;gap:.65rem}.check input{flex-shrink:0;margin-top:.3rem}.actions{display:flex;flex-wrap:wrap;gap:.7rem;margin-top:1rem}button{min-height:44px;padding:.6rem 1rem;margin:.2rem}button:focus-visible,textarea:focus-visible,select:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid #287d70;outline-offset:3px}`]})
export class FullPageSourceReview implements OnChanges,OnDestroy {
  @Input() submissionId='';@Input() mandatory=false;@Input() totalPages=0;@Input() pages:Pick<PageReview,'pageIndex'|'pageNumber'>[]=[];
  @Output() resolved=new EventEmitter<any>();@Output() conflict=new EventEmitter<void>();
  get pageCount(){return Math.max(this.totalPages,...this.pages.map(p=>p.pageIndex+1),0);}
  private http=inject(HttpClient);private epoch=0;private currentSubmission='';private drafts=new Map<number,{hash:string;text:string}>();
  private remember(){if(this.page)this.drafts.set(this.page.pageIndex,{hash:this.page.pageHash,text:this.text});}
  page:PageReview|null=null;imageUrl='';busy=false;message='';text='';confirmed=false;reviewedDeletedMaterial=false;classification='ACTIVE_PAGE_TRANSCRIPT';
  private get base(){return `${environment.apiUrl}/submissions/${encodeURIComponent(this.submissionId)}/source-review/page`;}
  private clear(){if(this.imageUrl)URL.revokeObjectURL(this.imageUrl);this.imageUrl='';this.page=null;this.text='';this.confirmed=false;this.reviewedDeletedMaterial=false;this.classification='ACTIVE_PAGE_TRANSCRIPT';}
  ngOnChanges(){if(this.currentSubmission!==this.submissionId){this.epoch++;this.clear();this.drafts.clear();this.currentSubmission=this.submissionId;this.busy=false;this.message='';}else if(this.page&&!this.pages.some(p=>p.pageIndex===this.page!.pageIndex)){this.epoch++;this.clear();this.busy=false;}}
  async open(index:number){if(this.busy)return;this.remember();this.clear();const epoch=++this.epoch;this.busy=true;this.message='';try{
    const r=await firstValueFrom(this.http.get<{data:PageReview}>(`${this.base}/${index}`));if(epoch!==this.epoch)return;
    if(!r.data.eligible)throw Error();this.page=r.data;const draft=this.drafts.get(index);this.text=draft?.hash===r.data.pageHash?draft.text:r.data.provisionalTranscript;
    const image=await firstValueFrom(this.http.get(`${this.base}/${index}/image`,{responseType:'blob'}));if(epoch===this.epoch)this.imageUrl=URL.createObjectURL(image);
  }catch{if(epoch===this.epoch){this.clear();this.message='This page cannot be opened safely. Refresh source review and try again.';}}finally{if(epoch===this.epoch)this.busy=false;}}
  async save(){if(this.busy||!this.page||!this.imageUrl||this.classification==='ACTIVE_PAGE_TRANSCRIPT'&&!this.confirmed)return;
    const epoch=this.epoch,p=this.page;this.busy=true;this.message='';try{
      const r=await firstValueFrom(this.http.post<{data:any}>(`${this.base}/${p.pageIndex}/resolve`,{revision:p.revision,sourceHash:p.sourceHash,pageHash:p.pageHash,pageIdentity:p.pageIdentity,
        classification:this.classification,transcriptExact:this.text,confirmWholePage:this.confirmed,reviewedDeletedMaterial:this.reviewedDeletedMaterial}));
      if(epoch!==this.epoch)return;this.drafts.delete(p.pageIndex);this.clear();this.resolved.emit(r.data);
    }catch{if(epoch===this.epoch){this.clear();this.message='The source may have changed. Reopen source review before saving again.';this.conflict.emit();}}
    finally{if(epoch===this.epoch)this.busy=false;}}
  cancel(){if(!this.busy){this.remember();this.epoch++;this.clear();this.message='';}}
  ngOnDestroy(){this.epoch++;this.clear();}
}
