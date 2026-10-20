import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CorrectionOverlay } from './correction-overlay';
import { AnnotationVisual, buildAnnotationVisuals } from './annotation-geometry';
import { AnnotationGroup, badgeLocalityRadius, groupCollidingBadges, layoutAnnotationGroups, sharedSegments } from './annotation-layout';
import { annotationBadgeMetrics } from './annotation-badge-metrics';
import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';

const correction = (id: string, symbol = 'REL'): FeedbackAnnotation => ({
  _id: id, source: 'AI', editable: false, submissionId: 'overlap-fixture', page: 1,
  symbol, category: symbol === 'TS' ? 'ORGANIZATION' : 'CONTENT', wordIds: [id], evidenceWordIds: [id],
  renderTarget: { version: 1, source: 'wordIds', wordIds: [id], anchors: [], boxes: [{ x: 1, y: 1, w: 2, h: 2 }] },
  quotedText: `Original ${id}`, message: `Message ${id}`, suggestedText: `Suggestion ${id}`, confidence: .9,
  color: id === 'a' ? '#287a55' : '#946b00'
});
function visual(id: string, x: number, symbol = 'REL', y = 1): AnnotationVisual {
  return { annotation: correction(id, symbol), semantic: false, lineKeys: ['word:0'], segments: [{
    id, left: x, top: y + 2, width: 2, anchorTop: y, lineKey: 'word:0', correctionIds: [id], color: '#287a55'
  }] };
}
const layout = (items: AnnotationVisual[], width: number) => layoutAnnotationGroups(items, width, width * 4 / 3, 110, annotationBadgeMetrics(width));
const members = (groups: AnnotationGroup[]) => groups.flatMap(g => g.annotations.map(a => a._id)).sort();
const collisions = (groups: AnnotationGroup[], width: number, height: number) => {
  const metrics = annotationBadgeMetrics(width); let count = 0;
  groups.forEach((a, i) => groups.slice(i + 1).forEach(b => {
    if (Math.abs(a.left - b.left) * width / 100 < (a.width + b.width) / 2 + 4
      && Math.abs(a.top - b.top) * height / 100 < metrics.collisionHeight) count++;
  })); return count;
};

describe('local visual collision groups', () => {
  it('groups two independent colliding targets without changing corrections or indicators', () => {
    const items = [visual('a', 1), visual('b', 1.5, 'TS')];
    const before = JSON.stringify(items), strokes = JSON.stringify(sharedSegments(items, false));
    const groups = layout(items, 375);
    expect(groups).toHaveSize(1); expect(groups[0].annotations).toHaveSize(2);
    expect(groups[0].code).toBe('REL·TS');
    expect(members(groups)).toEqual(['a', 'b']);
    expect(JSON.stringify(items)).toBe(before);
    expect(JSON.stringify(sharedSegments(items, false))).toBe(strokes);
  });
  it('groups three with a compact label and restores separate badges on a wide layout', () => {
    const items = [visual('a', 1), visual('b', 4, 'TS'), visual('c', 7, 'DEV')];
    const narrow = layout(items, 375);
    expect(narrow).toHaveSize(1); expect(narrow[0].code).toBe('REL·TS+1');
    expect(narrow[0].label).toContain('3 corrections');
    for (const symbol of ['REL', 'TS', 'DEV']) expect(narrow[0].label).toContain(symbol);
    const wide = layout(items, 1440);
    expect(wide).toHaveSize(3);
    expect(members(wide)).toEqual(members(narrow));
    expect(layout([...items].reverse(), 375)).toEqual(narrow);
  });
  it('keeps noncolliding and distant paragraph targets separate', () => {
    expect(layout([visual('a', 5), visual('b', 80, 'TS'), visual('c', 5, 'DEV', 70)], 375)).toHaveSize(3);
  });
  it('resolves a transitive A–B–C rectangle cluster deterministically', () => {
    const groups = ['a', 'b', 'c'].map((id, i): AnnotationGroup => ({ id, annotations: [correction(id)], semantic: false,
      lineKeys: new Set(['word:0']), anchorLeft: 20 + i * 7, anchorTop: 20,
      left: 20 + i * 7, top: 17, width: 30, code: 'REL', label: '' }));
    // A/C centers are 52.5px apart, while neighboring rectangles overlap.
    const resolved = groupCollidingBadges(groups, 375, 500, annotationBadgeMetrics(375));
    expect(resolved).toHaveSize(1); expect(members(resolved)).toEqual(['a', 'b', 'c']);
    expect(resolved[0].anchorLeft).toBe(20);
  });
  it('groups a semantic/lexical collision without merging rails and boundaries', () => {
    const lexical = visual('a', 1, 'SP');
    lexical.segments[0].boundary = true;
    const semantic = visual('b', 1.5, 'DEV');
    semantic.semantic = true;
    semantic.segments[0].height = 2;
    const before = JSON.stringify({ lexical, semantic });
    const groups = layout([lexical, semantic], 375);
    expect(groups).toHaveSize(1);
    expect(sharedSegments([lexical, semantic], false)[0].boundary).toBeTrue();
    expect(sharedSegments([lexical, semantic], true)).toHaveSize(1);
    expect(JSON.stringify({ lexical, semantic })).toBe(before);
  });
  for (const width of [320, 375, 430, 768, 1024, 1440]) {
    it(`retains every member and respects locality/image bounds at ${width}px`, () => {
      const items = [visual('a', 1), visual('b', 1.5, 'TS'), visual('c', 2, 'DEV'),
        visual('d', 94, 'SP', 98), visual('e', 94.5, 'CAP', 98)];
      const groups = layout(items, width), height = width * 4 / 3, metrics = annotationBadgeMetrics(width);
      expect(members(groups)).toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(collisions(groups, width, height)).toBe(0);
      for (const g of groups) {
        expect(g.left * width / 100 - g.width / 2).toBeGreaterThanOrEqual(0);
        expect(g.left * width / 100 + g.width / 2).toBeLessThanOrEqual(width);
        expect(g.top * height / 100 - metrics.height / 2).toBeGreaterThanOrEqual(0);
        expect(g.top * height / 100 + metrics.height / 2).toBeLessThanOrEqual(height);
        for (const a of g.annotations) {
          const v = items.find(v => v.annotation === a)!;
          expect(Math.hypot((g.left - v.segments[0].left - 1) * width / 100,
            (g.top - v.segments[0].anchorTop) * height / 100)).toBeLessThanOrEqual(badgeLocalityRadius(metrics) + .001);
        }
      }
    });
  }
});

describe('collision-group existing correction popup', () => {
  let fixture: ComponentFixture<CorrectionOverlay>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CorrectionOverlay] }).compileComponents();
    fixture = TestBed.createComponent(CorrectionOverlay);
  });
  afterEach(() => fixture.destroy());
  it('opens by keyboard, selects every exact correction/highlight, and closes with Escape', async () => {
    const annotations = ['REL', 'TS', 'DEV'].map((code, i) => correction(String.fromCharCode(97 + i), code));
    const words = annotations.map((a, i) => ({ id: a._id, text: 'time', separatorBefore: ' ' as const,
      bbox: { x: 1 + i * .5, y: 1, w: 2, h: 2 } }));
    fixture.nativeElement.style.width = '375px';
    fixture.componentRef.setInput('annotations', annotations);
    fixture.componentRef.setInput('ocrWords', words);
    fixture.componentRef.setInput('imageUrl', 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"/>'));
    fixture.detectChanges();
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    await image.decode(); fixture.componentInstance.onImageLoad({ target: image } as unknown as Event);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const original = JSON.stringify({ annotations, words });
    const indicators = JSON.stringify({ underlines: component.underlineSegments, rails: component.semanticRails });
    expect(component.markers).toHaveSize(1);
    const button = fixture.nativeElement.querySelector('.correction-overlay__marker') as HTMLButtonElement;
    expect(button.tagName).toBe('BUTTON'); expect(button.getAttribute('aria-label')).toContain('3 corrections');
    for (const key of ['Enter', ' ']) {
      button.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      fixture.detectChanges();
      const entries = fixture.nativeElement.querySelectorAll('.correction-overlay__entries button') as NodeListOf<HTMLButtonElement>;
      expect(entries).toHaveSize(3);
      entries.forEach((entry, i) => {
        entry.click(); fixture.detectChanges();
        expect(component.selectedId).toBe(annotations[i]._id);
        expect(component.explanation).toBe(annotations[i].message!);
        expect(component.suggestion).toBe(annotations[i].suggestedText!);
        expect(component.originalText).toBe(annotations[i].quotedText!);
        expect(entry.getAttribute('aria-pressed')).toBe('true');
        const own = [...component.underlineSegments, ...component.semanticRails].filter(s => s.correctionIds.includes(annotations[i]._id));
        expect(own.length).toBeGreaterThan(0); expect(own.every(s => component.isSelected(s))).toBeTrue();
      });
      component.onEscape(); fixture.detectChanges(); expect(component.activeMarker).toBeNull();
    }
    expect(JSON.stringify({ annotations, words })).toBe(original);
    expect(JSON.stringify({ underlines: component.underlineSegments, rails: component.semanticRails })).toBe(indicators);
    expect(buildAnnotationVisuals(annotations, words, 1, 600, 800)).toHaveSize(3);
  });
  it('preserves a selected member as live container resize splits and regroups badges', async () => {
    const annotations = ['SP', 'AGR', 'WC'].map((code, i) => correction(String.fromCharCode(97 + i), code));
    const words = annotations.map((a, i) => ({ id: a._id, text: 'time', separatorBefore: ' ' as const,
      bbox: { x: 1 + i * 3, y: 1, w: 2, h: 2 } }));
    fixture.nativeElement.style.width = '375px';
    fixture.componentRef.setInput('annotations', annotations);
    fixture.componentRef.setInput('ocrWords', words);
    fixture.componentRef.setInput('imageUrl', 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"/>'));
    fixture.detectChanges();
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    await image.decode(); fixture.componentInstance.onImageLoad({ target: image } as unknown as Event);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.markers).toHaveSize(1);
    (fixture.nativeElement.querySelector('.correction-overlay__marker') as HTMLButtonElement).click();
    fixture.detectChanges();
    (fixture.nativeElement.querySelectorAll('.correction-overlay__entries button')[1] as HTMLButtonElement).click();
    const indicators = JSON.stringify(component.underlineSegments);
    for (const [width, count] of [[1440, 3], [375, 1]]) {
      fixture.nativeElement.style.width = `${width}px`;
      component.onViewportChange();
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      fixture.detectChanges();
      expect(component.markers).toHaveSize(count);
      expect(component.selectedId).toBe('b');
      expect(component.activeMarker?.annotations.some(a => a._id === 'b')).toBeTrue();
      expect(component.explanation).toBe('Message b');
      expect(JSON.stringify(component.underlineSegments)).toBe(indicators);
    }
  });
});
