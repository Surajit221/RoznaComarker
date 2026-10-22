import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { FullPageSourceReview } from './full-page-source-review';
import { HumanSourceReview } from './human-source-review';

describe('full page source review fallback',()=>{
  const data={pageIndex:0,pageNumber:1,pageHash:'b'.repeat(64),pageIdentity:'c'.repeat(64),sourceHash:'a'.repeat(64),revision:2,eligible:true,provisionalTranscript:'  wemen <script>alert(1)</script>\n'};
  beforeEach(()=>TestBed.configureTestingModule({imports:[FullPageSourceReview,HumanSourceReview],providers:[provideHttpClient(),provideHttpClientTesting()]}));
  afterEach(()=>TestBed.inject(HttpTestingController).verify());
  async function opened(){const f=TestBed.createComponent(FullPageSourceReview);f.componentRef.setInput('submissionId','s');f.componentRef.setInput('pages',[{pageIndex:0,pageNumber:1}]);f.detectChanges();
    const pending=f.componentInstance.open(0),http=TestBed.inject(HttpTestingController);http.expectOne(r=>r.url.endsWith('/page/0')).flush({data});
    await Promise.resolve();http.expectOne(r=>r.url.endsWith('/page/0/image')).flush(new Blob(['page'],{type:'image/png'}));await pending;f.detectChanges();return f;}
  it('does not expose fallback without server eligibility; mapped options precede fallback',()=>{
    const f=TestBed.createComponent(HumanSourceReview);f.componentRef.setInput('submissionId','s');f.detectChanges();
    const c=f.componentInstance;c.review={sourceFidelity:{assessmentAllowed:false} as any,revision:0,sourceHash:'x',unavailable:0,items:[],pages:[]};f.detectChanges();
    expect(f.nativeElement.querySelector('app-full-page-source-review')).toBeNull();
    c.review={...c.review,pages:[{pageIndex:0,pageNumber:1}]};f.detectChanges();expect(f.nativeElement.textContent).toContain('Review full page transcription');f.destroy();
  });
  it('loads authenticated original image and labels provisional text with correction disabled and inert HTML',async()=>{
    const f=await opened(),el=f.nativeElement,t=el.querySelector('textarea');expect(t.value).toBe(data.provisionalTranscript);expect(el.querySelector('script')).toBeNull();
    for(const [key,value] of [['spellcheck','false'],['autocorrect','off'],['autocomplete','off'],['autocapitalize','off']])expect(t.getAttribute(key)).toBe(value);
    expect(el.textContent).toContain('review every line before confirming');expect(el.textContent).toContain('Exclude crossed-out/deleted text');expect(el.querySelector('img').src).toContain('blob:');
    expect(el.querySelector('.btn-primary').disabled).toBe(true);f.destroy();
  });
  it('requires whole page confirmation, preserves exact input and tokens, and suppresses duplicate saves',async()=>{
    const f=await opened(),c=f.componentInstance,http=TestBed.inject(HttpTestingController);await c.save();http.expectNone(r=>r.method==='POST');
    c.text=' \tMRS, wemen\r\nJudiment  ';c.confirmed=true;c.reviewedDeletedMaterial=true;
    const emitted=spyOn(c.resolved,'emit'),pending=c.save();void c.save();const req=http.expectOne(r=>r.url.endsWith('/page/0/resolve'));
    expect(req.request.body).toEqual({revision:2,sourceHash:data.sourceHash,pageHash:data.pageHash,pageIdentity:data.pageIdentity,classification:'ACTIVE_PAGE_TRANSCRIPT',transcriptExact:c.text,confirmWholePage:true,reviewedDeletedMaterial:true});
    req.flush({data:{revision:3}});await pending;expect(emitted).toHaveBeenCalledWith({revision:3});expect(c.page).toBeNull();expect(c.imageUrl).toBe('');f.destroy();
  });
  it('allows cannot determine without claiming whole-page authority',async()=>{
    const f=await opened(),c=f.componentInstance;c.classification='CANNOT_DETERMINE';const pending=c.save();const req=TestBed.inject(HttpTestingController).expectOne(r=>r.method==='POST');
    expect(req.request.body.confirmWholePage).toBe(false);req.flush({data:{}});await pending;f.destroy();
  });
  it('cancels without mutation and revokes original image URLs',async()=>{
    const f=await opened(),c=f.componentInstance,revoke=spyOn(URL,'revokeObjectURL');const url=c.imageUrl;c.cancel();expect(revoke).toHaveBeenCalledWith(url);expect(c.page).toBeNull();TestBed.inject(HttpTestingController).expectNone(r=>r.method==='POST');f.destroy();
  });
  it('mandatory mode shows progress and preserves edits when reopening an unchanged page',async()=>{
    const f=await opened(),c=f.componentInstance,http=TestBed.inject(HttpTestingController);
    f.componentRef.setInput('mandatory',true);f.componentRef.setInput('totalPages',2);f.detectChanges();
    expect(f.nativeElement.textContent).toContain('1 confirmed / 2 pages');expect(f.nativeElement.textContent).toContain('Page 1 of 2');
    c.text='  Exact wemen,\r\n';c.cancel();const pending=c.open(0);http.expectOne(r=>r.url.endsWith('/page/0')).flush({data});await Promise.resolve();
    http.expectOne(r=>r.url.endsWith('/image')).flush(new Blob(['page']));await pending;expect(c.text).toBe('  Exact wemen,\r\n');expect(c.confirmed).toBe(false);f.destroy();
  });
  it('stale conflicts discard editor and require refreshed review',async()=>{
    const f=await opened(),c=f.componentInstance;c.confirmed=true;const conflict=spyOn(c.conflict,'emit'),pending=c.save();
    TestBed.inject(HttpTestingController).expectOne(r=>r.method==='POST').flush({},{status:409,statusText:'Conflict'});await pending;
    expect(c.page).toBeNull();expect(conflict).toHaveBeenCalled();f.destroy();
  });
  it('does not retain late original image after switching submission',async()=>{
    const f=TestBed.createComponent(FullPageSourceReview);f.componentRef.setInput('submissionId','one');f.componentRef.setInput('pages',[{pageIndex:0,pageNumber:1}]);f.detectChanges();
    const c=f.componentInstance,pending=c.open(0),http=TestBed.inject(HttpTestingController);http.expectOne(r=>r.url.endsWith('/page/0')).flush({data});await Promise.resolve();
    const image=http.expectOne(r=>r.url.endsWith('/image'));f.componentRef.setInput('submissionId','two');f.detectChanges();image.flush(new Blob(['old']));await pending;expect(c.imageUrl).toBe('');expect(c.page).toBeNull();f.destroy();
  });
});
