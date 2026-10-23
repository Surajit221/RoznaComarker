import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CorrectionOverlay } from './correction-overlay';
import { buildAnnotationVisuals, type AnnotationVisual } from './annotation-geometry';
import { layoutAnnotationGroups, type AnnotationGroup, badgeLocalityRadius } from './annotation-layout';
import { clarifyAnnotationPlacement } from './annotation-placement';
import { annotationBadgeMetrics, DESKTOP_BADGE_METRICS } from './annotation-badge-metrics';
import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';

const annotation = (id:string):FeedbackAnnotation => ({_id:id,submissionId:'s',source:'AI',editable:false,
  symbol:'SP',category:'MECHANICS',color:'#FFF3BF',wordIds:[id],message:'Same correction'});
function visual(id:string,top:number,left=20,width=10):AnnotationVisual {
  return {annotation:annotation(id),semantic:false,lineKeys:['line-'+top],segments:[{id,top,left,width,
    anchorTop:top-3,color:'#FFF3BF',correctionIds:[id],lineKey:'line-'+top}]};
}
function base(items:AnnotationVisual[],height=1000):AnnotationGroup[] {
  return items.map(v=>({id:v.annotation._id,annotations:[v.annotation],semantic:false,lineKeys:new Set(v.lineKeys),
    anchorLeft:v.segments[0].left+v.segments[0].width/2,anchorTop:v.segments[0].anchorTop,
    left:v.segments[0].left+v.segments[0].width/2,top:v.segments[0].anchorTop-17/height*100,
    width:30,code:'SP',label:'Same correction'}));
}
function pathEdges(points:string,width:number,height:number):number[][] {
  const p=points.split(' ').map(s=>s.split(',').map(Number)).map(([x,y])=>[x*width/100,y*height/100]);
  return p.slice(1).map((v,i)=>[Math.min(v[0],p[i][0]),Math.max(v[0],p[i][0]),Math.min(v[1],p[i][1]),Math.max(v[1],p[i][1])]);
}
describe('render-only badge and leader clearance',()=>{
  it('moves a badge that used to sit on the preceding physical underline without moving either target',()=>{
    const items=[visual('a',30),visual('b',35)],groups=base(items),before=JSON.stringify(items);
    expect(Math.abs(groups[1].top*10-300)).toBeLessThan(5);
    clarifyAnnotationPlacement(groups,items,1000,1000,DESKTOP_BADGE_METRICS,badgeLocalityRadius());
    expect(Math.abs(groups[1].top*10-300)).toBeGreaterThan(28/2+5);
    expect(groups.every(g=>g.leaders?.length)).toBeTrue();expect(JSON.stringify(items)).toBe(before);
  });
  it('routes beside an unrelated underline instead of crossing it vertically',()=>{
    const items=[visual('a',30,18,14),visual('b',35)],groups=base(items);
    clarifyAnnotationPlacement(groups,items,1000,1000,DESKTOP_BADGE_METRICS,badgeLocalityRadius());
    expect(groups[1].leaders?.length).toBeGreaterThan(0);
    for(const leader of groups[1].leaders||[])for(const [left,right,top,bottom] of pathEdges(leader.points,1000,1000)) {
      expect(left<323&&right>177&&top<306&&bottom>297).toBeFalse();
    }
  });
  for(const width of [320,375,768,1024,1440])it(`keeps targets/membership/colors deterministic and local after resizing to ${width}px`,()=>{
    const items=[visual('a',30),visual('b',35),visual('c',40,35)],before=JSON.stringify(items),height=width*1.3;
    const metrics=annotationBadgeMetrics(width),groups=layoutAnnotationGroups(items,width,height,110,metrics);
    expect(groups.flatMap(g=>g.annotations.map(a=>a._id)).sort()).toEqual(['a','b','c']);
    expect(layoutAnnotationGroups([...items].reverse(),width,height,110,metrics)).toEqual(groups);
    for(const g of groups){
      expect(Math.hypot((g.left-g.anchorLeft)*width/100,(g.top-g.anchorTop)*height/100)).toBeLessThanOrEqual(badgeLocalityRadius(metrics)+.001);
      expect(g.left*width/100-g.width/2).toBeGreaterThanOrEqual(0);
      expect(g.left*width/100+g.width/2).toBeLessThanOrEqual(width);
      for(const l of g.leaders||[])expect(l.color).toBe('#FFF3BF');
    }
    expect(JSON.stringify(items)).toBe(before);
  });
  it('never drops a member or changes overlap grouping when no uncongested placement exists',()=>{
    const items=Array.from({length:12},(_,i)=>visual('c'+i,20+i*.1,20+i*.1));
    const groups=base(items),members=groups.map(g=>g.annotations);
    clarifyAnnotationPlacement(groups,items,160,200,annotationBadgeMetrics(320),badgeLocalityRadius(annotationBadgeMetrics(320)));
    expect(groups.map(g=>g.annotations)).toEqual(members);expect(groups).toHaveSize(12);
  });
  it('uses display-word boxes to avoid covering unannotated handwriting too',()=>{
    const items=[visual('a',30)],groups=base(items),words=[
      {id:'previous',text:'untouched',bbox:{x:20,y:24.5,w:10,h:2}},
      {id:'a',text:'literal',bbox:{x:20,y:27,w:10,h:3}}];
    clarifyAnnotationPlacement(groups,items,1000,1000,DESKTOP_BADGE_METRICS,badgeLocalityRadius(),words);
    const g=groups[0],left=g.left*10-g.width/2,right=g.left*10+g.width/2,top=g.top*10-14,bottom=g.top*10+14;
    for(const w of words)expect(left<(w.bbox.x+w.bbox.w)*10+2&&right>w.bbox.x*10-2
      &&top<(w.bbox.y+w.bbox.h)*10+2&&bottom>w.bbox.y*10-2).toBeFalse();
  });
  it('keeps multiline strokes and exact shared-target membership unchanged',()=>{
    const words=[{id:'a',text:'first',bbox:{x:20,y:20,w:10,h:3}},{id:'b',text:'second',separatorBefore:'\n' as const,bbox:{x:20,y:25,w:10,h:3}}];
    const items=buildAnnotationVisuals([{...annotation('multi'),wordIds:['a','b']}, {...annotation('overlap'),wordIds:['a','b']}],words,1,1000,1200);
    const before=JSON.stringify(items),groups=layoutAnnotationGroups(items,1000,1200);
    expect(items.every(v=>v.segments.length===2)).toBeTrue();expect(groups).toHaveSize(1);
    expect(groups[0].annotations.map(a=>a._id)).toEqual(['multi','overlap']);expect(JSON.stringify(items)).toBe(before);
  });
});

describe('leader selection presentation',()=>{
  let fixture:ComponentFixture<CorrectionOverlay>;
  beforeEach(async()=>{await TestBed.configureTestingModule({imports:[CorrectionOverlay]}).compileComponents();fixture=TestBed.createComponent(CorrectionOverlay);});
  afterEach(()=>fixture.destroy());
  it('uses the same active marker without moving target strokes or adding pointer targets',async()=>{
    fixture.nativeElement.style.width='800px';
    fixture.componentRef.setInput('ocrWords',[{id:'a',text:'literal',bbox:{x:20,y:30,w:10,h:3}}]);
    fixture.componentRef.setInput('annotations',[annotation('a')]);
    fixture.componentRef.setInput('imageUrl','data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1200"/>'));
    fixture.detectChanges();const image=fixture.nativeElement.querySelector('img') as HTMLImageElement;
    await image.decode();fixture.componentInstance.onImageLoad({target:image} as unknown as Event);fixture.detectChanges();
    const before=JSON.stringify(fixture.componentInstance.underlineSegments);
    const leader=fixture.nativeElement.querySelector('.correction-overlay__leader') as SVGElement;
    expect(leader).toBeTruthy();expect(getComputedStyle(leader.parentElement!).pointerEvents).toBe('none');
    (fixture.nativeElement.querySelector('.correction-overlay__marker') as HTMLButtonElement).click();fixture.detectChanges();
    expect(fixture.componentInstance.selectedId).toBe('a');expect(leader.classList.contains('is-selected')).toBeTrue();
    expect(JSON.stringify(fixture.componentInstance.underlineSegments)).toBe(before);
  });
});
