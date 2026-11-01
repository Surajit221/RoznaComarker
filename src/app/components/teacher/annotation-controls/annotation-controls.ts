import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output, inject, type OnChanges, type SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { TokenizedTranscript } from '../../submission-details/tokenized-transcript/tokenized-transcript';
import type { FeedbackAnnotation } from '../../../models/feedback-annotation.model';
import type { OcrWord } from '../../../models/ocr-token.model';
import { CorrectionOverlay } from '../../correction-overlay/correction-overlay';
import { SubmissionPageReview } from '../../submission-page-review/submission-page-review';
import { buildTranscriptPageViews, type TranscriptPageView } from '../../../utils/transcript-page-views.util';

interface Correction extends FeedbackAnnotation { id: string; moderationStatus: string; }
interface Page { fileId:string; pageNumber:number; startChar:number; text:string; words:OcrWord[]; }
interface Snapshot { revision:number; sourceHash:string; pages:Page[]; corrections:Correction[]; effective:Correction[];
  scoringReviewRequired:boolean; scorePolicy:string; legend:{groups:{key:string;label:string;symbols:{symbol:string;label:string}[]}[]}; }
interface Value { fileId:string; page:number; startChar:number; endChar:number; quotedText:string; category:string; symbol:string; message:string; suggestedText:string; }
interface Audit { action:string; actor:string; timestamp:string; previousRevision:number; newRevision:number; before:unknown; after:unknown; }
@Component({selector:'app-annotation-controls',imports:[CommonModule,FormsModule,TokenizedTranscript,CorrectionOverlay,SubmissionPageReview],
  templateUrl:'./annotation-controls.html',styleUrl:'./annotation-controls.css'})
export class AnnotationControls implements OnChanges {
  @Input({required:true}) submissionId='';
  @Input() imageUrl:string|null=null;
  @Input() activeFileId:string|null=null;
  @Input() isPdf=false;
  @Output() saved=new EventEmitter<void>();
  private http=inject(HttpClient);
  data:Snapshot|null=null; busy=false; error=''; open=false; preview=false;
  editing:string|null=null; form:Value|null=null; pageIndex=0; history:Audit[]=[]; nextOffset:number|null=null;
  private pending:{action:string;id?:string;revision:number;sourceHash:string;requestId:string;value?:Value}|null=null;
  private version=0;
  previewPages:TranscriptPageView[]=[];
  get pdfPages():TranscriptPageView[]{return this.previewPages.filter(p=>!!p.imageUrl);}
  get activePage():TranscriptPageView|undefined{return this.previewPages.find(p=>p.fileId===this.activeFileId && p.pageNumber===1);}
  ngOnChanges(changes:SimpleChanges):void {if(!changes['submissionId'])return;this.version++;this.data=null;this.form=null;this.pending=null;this.error='';this.open=false;this.busy=false;this.history=[];this.previewPages=[];}
  canLeave():boolean {return !this.busy && (!this.pending && (!this.form || window.confirm('Discard unsaved annotation edits?')));}
  @HostListener('window:beforeunload',['$event']) beforeUnload(event:BeforeUnloadEvent):void {
    if(this.form||this.pending||this.busy){event.preventDefault();event.returnValue='';}
  }
  private get url():string {return `${environment.apiUrl}/submissions/${encodeURIComponent(this.submissionId)}/teacher-annotations`;}
  async load():Promise<void> {
    if(this.busy||this.form||this.pending)return; const version=this.version;this.busy=true;this.error='';
    try {const result=await firstValueFrom(this.http.get<{data:Snapshot}>(this.url));if(version===this.version){this.data=result.data;this.open=true;
      this.previewPages=buildTranscriptPageViews({submissionId:this.submissionId,fileIds:[...new Set(result.data.pages.map(p=>p.fileId))],ocrPages:result.data.pages,corrections:result.data.effective});}}
    catch(error){if(version===this.version)this.failure(error);}finally{if(version===this.version)this.busy=false;}
  }
  begin(c?:Correction):void {
    if(this.busy||this.form||!this.data)return;
    this.editing=c?.id||null;this.preview=false;this.error='';
    this.pageIndex=c?Math.max(0,this.data.pages.findIndex(p=>p.fileId===c.fileId&&p.pageNumber===c.page)):0;
    this.form={fileId:c?.fileId||'',page:c?.page||1,startChar:c?.startChar||0,endChar:c?.endChar||0,
      quotedText:c?.quotedText||'',symbol:c?.symbol||'AGR',category:c?.category||'GRAMMAR',message:c?.message||'',suggestedText:c?.suggestedText||''};
  }
  select(textarea:HTMLTextAreaElement):void {
    const page=this.data?.pages[this.pageIndex];if(!this.form||!page||this.busy||this.pending)return;
    this.form={...this.form,fileId:page.fileId,page:page.pageNumber,startChar:page.startChar+textarea.selectionStart,
      endChar:page.startChar+textarea.selectionEnd,quotedText:page.text.slice(textarea.selectionStart,textarea.selectionEnd)};
  }
  category():void {if(this.form)this.form.category=this.data?.legend.groups.find(g=>g.symbols.some(s=>s.symbol===this.form?.symbol))?.key||'';}
  cancel():void {if(!this.busy&&!this.pending){this.form=null;this.editing=null;this.error='';}}
  async mutate(action:string,id?:string):Promise<void> {
    if(this.busy||!this.data)return;
    if(!this.pending)this.pending={action,id,revision:this.data.revision,sourceHash:this.data.sourceHash,requestId:crypto.randomUUID(),
      ...(['add','edit'].includes(action)&&this.form?{value:{...this.form}}:{})};
    const version=this.version;this.busy=true;this.error='';
    try {
      await firstValueFrom(this.http.post(this.url,this.pending));
      if(version!==this.version)return;
      this.pending=null;this.form=null;this.editing=null;this.saved.emit();this.history=[];this.busy=false;await this.load();
    } catch(error){if(version===this.version){this.failure(error);if(error instanceof HttpErrorResponse&&error.status>=400&&error.status<500)this.pending=null;}}
    finally{if(version===this.version)this.busy=false;}
  }
  get retryPending():boolean{return Boolean(this.pending);}
  retry():void {if(this.pending)void this.mutate(this.pending.action,this.pending.id);}
  async audit(offset=0):Promise<void> {
    if(this.busy||this.form)return;this.busy=true;const version=this.version;
    try {const result=await firstValueFrom(this.http.get<{data:{items:Audit[];nextOffset:number|null}}>(`${this.url}/history`,{params:{offset}}));
      if(version===this.version){this.history=result.data.items;this.nextOffset=result.data.nextOffset;}}
    catch(error){if(version===this.version)this.failure(error);}finally{if(version===this.version)this.busy=false;}
  }
  private failure(error:unknown):void {
    const code=error instanceof HttpErrorResponse?error.error?.code:'';
    this.error=code==='ANNOTATION_REVISION_CONFLICT'?'Feedback changed. Keep a copy of your edits, then cancel and reload before saving.':
      code==='ANNOTATION_INVALID_SPAN'?'Select an exact span on one current transcript page.':
      code==='ANNOTATION_HISTORY_LIMIT'?'Annotation history limit reached. Contact support; existing history is preserved.':
      code==='ANNOTATION_ASSESSMENT_BUSY'?'Assessment is still running. Try again after it completes.':
      code==='ANNOTATION_INVALID_CATEGORY'?'Choose a symbol from the correction legend.':
      'The change could not be confirmed. Check your fields or retry the same request.';
  }
}
