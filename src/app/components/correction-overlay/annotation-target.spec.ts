import { buildAnnotationVisuals } from './annotation-geometry';
import { sharedSegments, layoutAnnotationGroups } from './annotation-layout';
import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import type { OcrWord } from '../../models/ocr-token.model';
const words: OcrWord[] = ['one','two','three'].map((text,i)=>({id:`w${i}`,text,bbox:{x:10+i*10,y:10,w:8,h:3},separatorBefore:' '}));
const correction = (): FeedbackAnnotation => ({_id:'c',submissionId:'s',symbol:'P',source:'AI',editable:false,wordIds:words.map(w=>w.id)});
describe('canonical visual target precedence',()=>{
  it('consumes the shared backend target without reselecting broad evidence',()=>{
    const c=correction();c.visualTarget={version:1,wordIds:['w0','w1','w2'],anchors:[]};
    c.renderTarget={version:1,source:'visualTarget',wordIds:['w1'],anchors:[],boxes:[words[1].bbox!]};
    const [v]=buildAnnotationVisuals([c],words,1,1000,1200);
    expect(v.segments.length).toBe(1);expect(v.segments[0].left).toBeGreaterThan(19);
    expect(v.segments[0].width).toBeLessThan(9);
    c.renderTarget={version:1,source:'visualTarget',wordIds:[],anchors:[{wordId:'w1',side:'after',operation:'INSERT'}],boxes:[]};
    const [anchored]=buildAnnotationVisuals([c],words,1,1000,1200);
    expect(anchored.segments.length).toBe(1);expect(anchored.segments[0].boundary).toBeTrue();
    expect(anchored.segments[0].left).toBeGreaterThan(27);
  });
  it('narrow IDs override broad evidence without text search',()=>{
    const c=correction();c.visualTarget={version:1,wordIds:['w1'],anchors:[]};
    const [v]=buildAnnotationVisuals([c],words,1,1000,1200);expect(v.segments.length).toBe(1);
    expect(v.segments[0].left).toBeGreaterThan(19);expect(v.segments[0].width).toBeLessThan(9);
    expect(c.wordIds!.length).toBe(3);
  });
  it('two boundary ticks remain one correction and one detail entry',()=>{
    const c=correction();c.visualTarget={version:1,wordIds:[],anchors:[{wordId:'w0',side:'after',operation:'INSERT'},{wordId:'w1',side:'after',operation:'INSERT'}]};
    const vs=buildAnnotationVisuals([c],words,1,1000,1200),segments=sharedSegments(vs,false);
    expect(segments.length).toBe(2);expect(segments.every(s=>s.boundary&&s.width<1)).toBeTrue();
    expect(layoutAnnotationGroups(vs,1000,1200).flatMap(g=>g.annotations).length).toBe(1);
  });
  it('unknown target IDs safely fall back to legacy IDs',()=>{
    const c=correction();c.visualTarget={version:1,wordIds:['foreign'],anchors:[]};
    expect(buildAnnotationVisuals([c],words,1,1000,1200)[0].segments)
      .toEqual(buildAnnotationVisuals([correction()],words,1,1000,1200)[0].segments);
  });
  it('canonical-7 IDs, missing target and failed IDs with boxes remain renderable',()=>{
    expect(buildAnnotationVisuals([correction()],words,1,1000,1200).length).toBe(1);
    const c=correction();c.wordIds=['missing'];c.bboxList=[{x:10,y:10,w:8,h:3}];
    expect(buildAnnotationVisuals([c],words,1,1000,1200).length).toBe(1);
  });
  it('strong/influence overlapping source boxes produce separate line keys',()=>{
    const ws:OcrWord[]=[{id:'strong',text:'strong',bbox:{x:61.78,y:16.667,w:14.66,h:4.078}},
      {id:'influence',text:'influence',bbox:{x:11.78,y:19.858,w:20.88,h:3.369}}];
    const c=correction();c.wordIds=ws.map(w=>w.id);
    expect(buildAnnotationVisuals([c],ws,1,450,564)[0].lineKeys.length).toBe(2);
  });
  for(const angle of [0,3,7])it(`keeps sloped ${angle} degree lines separate`,()=>{
    const ws:OcrWord[]=Array.from({length:12},(_,i)=>({id:`a${i}`,text:'word',bbox:{x:10+(i%6)*9,y:10+Math.floor(i/6)*5+Math.tan(angle*Math.PI/180)*(i%6)*9,w:7,h:3.5}}));
    const c=correction();c.wordIds=ws.map(w=>w.id);
    expect(buildAnnotationVisuals([c],ws,1,1000,1000)[0].lineKeys.length).toBe(2);
  });
});
