import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { HumanSourceReview } from './human-source-review';
describe('human source review',()=>{
  const source={mode:'astra_verified',status:'HUMAN_REVIEW_REQUIRED',assessmentAllowed:false,transcriptExact:'sence',pages:[],humanReview:{required:true,total:1,resolved:0,unresolved:1,unavailable:0}};
  const data={sourceFidelity:source,revision:0,sourceHash:'a'.repeat(64),unavailable:0,items:[{reviewItemId:'item',pageNumber:1,reasonCodes:['READER_UNCERTAIN_SPAN'],
    provisionalText:'sence <script>alert(1)</script>',verificationState:'PENDING_HUMAN_REVIEW',canConfirm:true,cropAvailable:true}]};
  beforeEach(()=>TestBed.configureTestingModule({imports:[HumanSourceReview],providers:[provideHttpClient(),provideHttpClientTesting()]}));
  afterEach(()=>TestBed.inject(HttpTestingController).verify());
  async function opened(){const f=TestBed.createComponent(HumanSourceReview);f.componentRef.setInput('submissionId','s');f.detectChanges();
    const pending=f.componentInstance.open(),http=TestBed.inject(HttpTestingController);http.expectOne(r=>r.url.endsWith('/s/source-review')).flush({data});
    await Promise.resolve();http.expectOne(r=>r.url.endsWith('/item/crop')).flush(new Blob(['crop'],{type:'image/png'}));await pending;f.detectChanges();return f;}
  it('loads crop through authenticated HttpClient and renders source as inert text with autocorrection disabled',async()=>{
    const f=await opened(),el=f.nativeElement;expect(el.querySelector('script')).toBeNull();expect(el.querySelector('pre').textContent).toBe(data.items[0].provisionalText);
    for(const input of el.querySelectorAll('textarea')){expect(input.getAttribute('spellcheck')).toBe('false');expect(input.getAttribute('autocorrect')).toBe('off');expect(input.getAttribute('autocapitalize')).toBe('off');}
    expect(el.textContent).toContain('Do not fix spelling or grammar');expect(el.querySelector('img').src).toContain('blob:');f.destroy();
  });
  it('sends exact input, classification and concurrency tokens without client offsets; duplicate clicks send once',async()=>{
    const f=await opened(),c=f.componentInstance;c.text='  wemen,\nJudiment';c.deletedText='crossed';
    const pending=c.confirm();void c.confirm();const http=TestBed.inject(HttpTestingController),req=http.expectOne(r=>r.url.endsWith('/item/resolve'));
    expect(req.request.body).toEqual({revision:0,sourceHash:'a'.repeat(64),classification:'ACTIVE_STUDENT_TEXT',text:'  wemen,\nJudiment',deletedText:'crossed'});
    req.flush({data:{...data,revision:1,items:[],sourceFidelity:{...source,status:'HUMAN_VERIFIED',assessmentAllowed:true}}});await pending;f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Assessment is continuing');f.destroy();
  });
  it('stale version conflict discards stale form and requests a fresh review instead of resubmitting',async()=>{
    const f=await opened(),pending=f.componentInstance.confirm();TestBed.inject(HttpTestingController).expectOne(r=>r.url.endsWith('/item/resolve')).flush({}, {status:409,statusText:'Conflict'});
    await pending;f.detectChanges();expect(f.componentInstance.review).toBeNull();expect(f.nativeElement.textContent).toContain('source may have changed');f.destroy();
  });
  it('switching submissions discards late old responses and crop state',async()=>{
    const f=TestBed.createComponent(HumanSourceReview);f.componentRef.setInput('submissionId','one');f.detectChanges();const pending=f.componentInstance.open();
    const req=TestBed.inject(HttpTestingController).expectOne(r=>r.url.endsWith('/one/source-review'));
    f.componentRef.setInput('submissionId','two');f.detectChanges();req.flush({data});await pending;expect(f.componentInstance.review).toBeNull();f.destroy();
  });
});
