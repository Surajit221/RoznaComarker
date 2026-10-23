import { refineBadgeStrokeClearance } from './annotation-badge-clearance';
import type { AnnotationGroup } from './annotation-layout';
import { badgeLocalityRadius } from './annotation-layout';
import type { AnnotationVisual } from './annotation-geometry';
import { annotationBadgeMetrics, DESKTOP_BADGE_METRICS } from './annotation-badge-metrics';
import type { FeedbackAnnotation } from '../../models/feedback-annotation.model';
import { TestBed } from '@angular/core/testing';
import { CorrectionOverlay } from './correction-overlay';
import { sharedSegments } from './annotation-layout';

const annotation = (id: string): FeedbackAnnotation => ({ _id: id, submissionId: 's', source: 'AI', editable: false,
  symbol: 'SP', category: 'MECHANICS', color: '#FFF3BF', wordIds: [id], message: 'Unchanged' });
function visual(id: string, top: number, left = 20): AnnotationVisual {
  return { annotation: annotation(id), semantic: false, lineKeys: ['line-' + id], segments: [{ id, top,
    left, width: 10, anchorTop: top - 3, correctionIds: [id], color: '#FFF3BF' }] };
}
function group(id: string, top = 27): AnnotationGroup {
  return { id, annotations: [annotation(id)], semantic: false, lineKeys: new Set(['line-' + id]),
    anchorLeft: 25, anchorTop: 27, left: 25, top, width: 30, code: 'SP', label: 'Unchanged' };
}
function state() { return { groups: [group('a')], visuals: [visual('a', 30), visual('other', 24.7)] }; }
function refine(groups: AnnotationGroup[], visuals: AnnotationVisual[]) {
  return refineBadgeStrokeClearance(groups, visuals, 1000, 1000, DESKTOP_BADGE_METRICS);
}

describe('browser-only local badge/stroke clearance', () => {
  it('moves down by only the two pixels needed to clear the preceding unrelated underline', () => {
    const { groups, visuals } = state(), before = JSON.stringify(visuals), annotations = groups[0].annotations;
    refine(groups, visuals);
    expect(groups[0].top).toBeCloseTo(27.2, 8);
    expect(groups[0].top * 10 - 14 - (247 + 3)).toBeCloseTo(8, 8);
    expect(groups[0].left).toBe(25); expect(groups[0].annotations).toBe(annotations);
    expect(JSON.stringify(visuals)).toBe(before);
  });
  it('can move upward when the unrelated stroke is below the badge', () => {
    const groups = [group('a')], visuals = [visual('a', 30), visual('other', 29)];
    refine(groups, visuals); expect(groups[0].top).toBeCloseTo(26.8, 8);
  });
  it('does not move an already clear badge or treat its own stroke as unrelated', () => {
    const groups = [group('a')], visuals = [visual('a', 28.8)];
    const before = JSON.stringify(groups); refine(groups, visuals); expect(JSON.stringify(groups)).toBe(before);
  });
  it('leaves a badge visible and unchanged when both directions are blocked', () => {
    const { groups, visuals } = state(); visuals.push(visual('below', 28.6));
    const before = JSON.stringify(groups); refine(groups, visuals); expect(JSON.stringify(groups)).toBe(before);
    expect(groups).toHaveSize(1);
  });
  it('does not create an unrelated badge collision while nudging', () => {
    const { groups, visuals } = state(); groups.push({ ...group('b', 30.3), anchorTop: 30.3 });
    const before = groups[0].top; refine(groups, visuals); expect(groups[0].top).toBe(before);
  });
  it('rejects a nudge that would cover any unannotated source word', () => {
    const { groups, visuals } = state();
    refineBadgeStrokeClearance(groups, visuals, 1000, 1000, DESKTOP_BADGE_METRICS,
      [{ id: 'plain', text: 'unchanged', bbox: { x: 24, y: 28.7, w: 3, h: 1 } }]);
    expect(groups[0].top).toBe(27);
  });
  it('never exceeds its existing source locality radius', () => {
    const { groups, visuals } = state(); visuals[0].segments[0].anchorTop = 27 - badgeLocalityRadius() / 10;
    refine(groups, visuals); expect(groups[0].top).toBe(27);
  });
  it('keeps shared-target members, labels, colors and every multiline segment identical', () => {
    const { groups, visuals } = state(); groups[0].annotations.push(annotation('shared')); groups[0].code = 'SP+1';
    const shared = visual('shared', 30); shared.segments.push({ ...shared.segments[0], id: 'second-line', top: 40 });
    visuals.push(shared); const members = groups[0].annotations, before = JSON.stringify(visuals);
    refine(groups, visuals); expect(groups[0].annotations).toBe(members); expect(groups[0].code).toBe('SP+1');
    expect(groups[0].annotations.every(a => a.color === '#FFF3BF')).toBeTrue(); expect(JSON.stringify(visuals)).toBe(before);
  });
  it('reserves clearance for unrelated semantic rails including their CSS minimum height', () => {
    const { groups, visuals } = state(); visuals[1].semantic = true; visuals[1].segments[0].width = 0;
    visuals[1].segments[0].left = 25; visuals[1].segments[0].top = 24.2; visuals[1].segments[0].height = 0.1;
    refine(groups, visuals); expect(groups[0].top).toBeCloseTo(27.2, 8);
  });
  it('reserves clearance for unrelated decorative leaders', () => {
    const { groups, visuals } = state(); visuals.pop();
    groups.push({ ...group('b'), left: 60, leaders: [{ id: 'b-leader', color: '#123456', points: '20,25 30,25' }] });
    refine(groups, visuals); expect(groups[0].top).toBeCloseTo(27.2, 8);
  });
  it('reattaches the badge end of an owned leader while leaving its source endpoint unchanged', () => {
    const { groups, visuals } = state();
    groups[0].leaders = [{ id: 'a-leader', color: '#FFF3BF', points: '26.5,27 31.6,27 31.6,30 31.3,30' }];
    refine(groups, visuals); expect(groups[0].top).toBeCloseTo(27.2, 8);
    expect(groups[0].leaders![0].points.split(' ').at(-1)).toBe('31.3,30');
    const start = groups[0].leaders![0].points.split(' ')[0].split(',').map(Number);
    expect(start[0]).toBe(26.5); expect(start[1]).toBeCloseTo(27.2, 8);
    expect(groups[0].leaders![0].id).toBe('a-leader'); expect(groups[0].leaders![0].color).toBe('#FFF3BF');
  });
  it('retains both badge and leader if rerouting would hit unannotated text', () => {
    const { groups, visuals } = state();
    groups[0].leaders = [{ id: 'a-leader', color: '#FFF3BF', points: '26.5,27 31.6,27 31.6,30 31.3,30' }];
    const before = JSON.stringify(groups);
    refineBadgeStrokeClearance(groups, visuals, 1000, 1000, DESKTOP_BADGE_METRICS,
      [{ id: 'text', text: 'retained', bbox: { x: 29, y: 27.2, w: 1, h: 1 } }]);
    expect(JSON.stringify(groups)).toBe(before);
  });
  for (const width of [320, 375, 768, 1024, 1440]) it(`uses CSS-pixel clearance without regrouping at ${width}px`, () => {
    const height = width * 1.3, metrics = annotationBadgeMetrics(width), center = height * .27;
    const groups = [group('a')], visuals = [visual('a', 30), visual('other', (center - metrics.height / 2 - 9) / height * 100)];
    visuals[0].segments[0].top = (center + metrics.height / 2 + 12) / height * 100;
    visuals[0].segments[0].anchorTop = 27;
    const before = JSON.stringify(visuals), ids = groups.flatMap(g => g.annotations.map(a => a._id));
    refineBadgeStrokeClearance(groups, visuals, width, height, metrics);
    expect((groups[0].top - 27) / 100 * height).toBeCloseTo(2, 7);
    expect(groups.flatMap(g => g.annotations.map(a => a._id))).toEqual(ids);
    expect(JSON.stringify(visuals)).toBe(before);
    const repeated = [group('a')]; refineBadgeStrokeClearance(repeated, visuals, width, height, metrics);
    expect(repeated).toEqual(groups);
  });
  it('retains all groups for zero-sized images and null word geometry', () => {
    const { groups, visuals } = state(); const before = JSON.stringify(groups);
    refineBadgeStrokeClearance(groups, visuals, 0, 0, DESKTOP_BADGE_METRICS, [{ id: 'null', text: 'literal', bbox: null }]);
    expect(JSON.stringify(groups)).toBe(before);
  });
});

describe('badge clearance in the rendered overlay', () => {
  it('retains all buttons, source strokes and selection after a dense layout', async () => {
    await TestBed.configureTestingModule({ imports: [CorrectionOverlay] }).compileComponents();
    const fixture = TestBed.createComponent(CorrectionOverlay);
    try {
      fixture.componentRef.setInput('imageUrl', 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1040"/>'));
      fixture.detectChanges();
      const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
      await image.decode(); fixture.componentInstance.onImageLoad({ target: image } as unknown as Event);
      spyOn(image, 'getBoundingClientRect').and.returnValue({ width: 800, height: 1040 } as DOMRect);
      const visuals = [visual('c0', 25, 38), visual('c1', 27.95, 32), visual('c2', 30.9, 26),
        visual('c3', 33.85, 20), visual('c4', 36.8, 38)];
      const state = fixture.componentInstance as unknown as { visuals: AnnotationVisual[]; layoutMarkers(): void };
      state.visuals = visuals; fixture.componentInstance.underlineSegments = sharedSegments(visuals, false);
      const strokes = JSON.stringify(fixture.componentInstance.underlineSegments);
      state.layoutMarkers(); fixture.detectChanges();
      expect(fixture.componentInstance.markers.flatMap(g => g.annotations.map(a => a._id)).sort())
        .toEqual(['c0', 'c1', 'c2', 'c3', 'c4']);
      const buttons = fixture.nativeElement.querySelectorAll('.correction-overlay__marker') as NodeListOf<HTMLButtonElement>;
      expect(buttons.length).toBe(fixture.componentInstance.markers.length);
      const selected = fixture.componentInstance.markers[0].annotations[0]._id;
      buttons[0].focus(); buttons[0].click(); fixture.detectChanges();
      expect(fixture.componentInstance.selectedId).toBe(selected);
      expect(JSON.stringify(fixture.componentInstance.underlineSegments)).toBe(strokes);
    } finally { fixture.destroy(); }
  });
});
