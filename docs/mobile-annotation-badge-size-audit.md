# COMARKER MOBILE ANNOTATION BADGE SIZE AUDIT

## 1. Root Cause

The essay image scaled down with its container, while badges retained a 26px visible height and desktop width estimates on phones. The layout reserved 32px vertical collision spacing at every width. This made badges dominate the smaller handwriting.

This is a frontend presentation change only. OCR boxes, IDs, targets, line grouping, correction semantics/counts, underlines, boundary ticks and semantic rails were not edited. No backend or API changes were made.

## 2. Files Changed

All runtime/test changes are under `src/app/components/correction-overlay/`:

- `annotation-badge-metrics.ts`: shared responsive presentation and placement metrics.
- `annotation-badge-metrics.spec.ts`: desktop compatibility, mobile size, grouping/count/geometry preservation and bounds checks.
- `annotation-layout.ts`: consume metrics for visible width, collision height, offsets and edge clearance. Existing grouping rules/thresholds remain intact.
- `correction-overlay.ts`: choose metrics using viewport width in the existing layout recalculation.
- `correction-overlay.html`: bind metrics as CSS custom properties.
- `correction-overlay.css`: use actual responsive dimensions and expanded invisible tap regions.
- `correction-overlay.spec.ts`: verify rendered responsive sizes through the existing resize path.

This document and private QA scripts/artifacts were also created. Existing unrelated working changes were preserved.

## 3. Responsive Metrics (initial pass; follow-up below)

| Viewport | Local/group height | Minimum width | Font | Horizontal padding | Border | Collision height |
|---|---:|---:|---:|---:|---:|---:|
| 1440 (>1024) | 28px | 30px | 9px | 2px | 2px | 32px |
| 1024 (769–1024) | 26px | 30px | 9px | 2px | 2px | 32px |
| 768 (481–768) | 24px | 26px | 9px | 5px | 1px | 28px |
| 430 (391–480) | 21px | 22px | 8.5px | 4px | 1px | 25px |
| 390 / 375 (≤390) | 20px | 21px | 8px | 4px | 1px | 24px |

Vertical padding remains 0; the fixed visible height centers the label. Font weight remains 800 and line height remains 1. Group pills retain content-dependent widths, identical height to local badges, and their original labels. Phone shadows are lighter. No scale transform is used; the existing centering translation remains.

Examples from the real sample: CAP width changes from 32px to 25px at 430 and approximately 24.4px at 390/375; P changes from 30px to 22/21px. The smaller dimensions expose more of the writing. The approximately 25–35% footprint goal is expressed across width and height rather than a CSS scale factor; resulting area reduction varies by label.

## 4. Touch Target

Phone visible size is 20–21px high, with a **40px minimum effective interaction region** on each axis. Wider grouped pills keep their own width. The transparent pseudo-element expands around the badge; its inset accounts for the button border so the actual region reaches 40px, allowing subpixel rounding.

Browser measurement confirmed approximately 40 × 40px regions. A touchscreen tap 4px above the visible badge opened the correct correction. Selection retained the same visible badge height and image-stage width. Existing >768px tap behavior is preserved.

Dense handwriting hit testing found zero badge centers intercepted by another button's expanded region at all six viewport widths.

## 5. Layout Engine Synchronization

TypeScript chooses one `AnnotationBadgeMetrics` object per existing layout calculation. Its width estimate, visible height, font, padding, border, shadow and interaction metrics drive CSS variables. Placement uses the same responsive width and height, including collision spacing and bounded anchor offsets. Recursive placement retries carry the selected metrics forward.

Desktop offsets remain 17px with the existing 47px fallback. Phone primary offsets are 13.5px / 13px, keeping smaller badges attached to their targets. Canonical anchor percentages and annotation segments remain unchanged. Grouping thresholds, spatial bins and selection logic were not changed.

## 6. Desktop Regression

**PASS.** Before/after screenshots are byte-identical at both 1440 and 1024 for real handwriting, dense synthetic, punctuation, agreement and insertion fixtures. Visible dimensions and image widths are unchanged above 768px.

## 7. Mobile Dense Page

Before: 26px visible height at 430, 390 and 375. After: 21px at 430; 20px at 390/375, smaller label widths and lighter shadows.

QA covered both the six-correction real handwritten sample and a clearly labeled **42-correction dense stress fixture** on those same image bytes: six existing corrections plus 36 synthetic presentation-only corrections. The stress additions were never saved or represented as actual student errors. A separate 39-correction synthetic page was also tested.

All correction memberships remain available through the existing grouped detail navigation. No corrections were hidden or removed. Normal selected/faded states and readable detail dialogs remain unchanged.

## 8. Badge Collision

Before: **0** visible collisions across the tested fixtures. After: **0**. The six viewport sizes are 1440, 1024, 768, 430, 390 and 375.

The synthetic page retains 39 corrections; the original handwriting retains six; the dense handwriting stress fixture retains 42. Visible group counts may reflect the existing density/placement retry behavior, but canonical counts and group access are preserved. No grouping threshold was modified.

## 9. Out-of-Bounds

**0** visible badges outside the image in before/after QA. Image width and image-stage width remain aligned with zero measured difference. Real-image widths remain 1000, 992, 736, 398, 358 and 343px respectively.

## 10. Teacher / Student Consistency

Both views use the same shared overlay; neither page's data flow was changed. Existing teacher/student submission integration tests were included. The sizing applies consistently through the shared component.

## 11. Accessibility

Button semantics, ARIA labels/expanded state, keyboard focus, Escape, grouped item navigation and existing detail interactions remain intact. No ARIA state was removed. Smaller badges retain a visible focus outline and a larger invisible tap region. Selected badges do not scale or change dimensions. Mobile detail-dialog typography, focus behavior, close controls and scroll locking were not edited.

Landscape QA at **430 × 320** confirmed width-based phone metrics, successful expanded-area tapping and stable image-stage dimensions after opening details. Sizing depends on viewport width rather than orientation alone.

## 12. Performance

Additional API calls: **0**. Additional AI calls: **0**. Additional OCR calls: **0**.

No new observer, scroll/mouse listener or animation loop was added. The existing resize/orientation/layout scheduling chooses the responsive metrics and performs its normal recalculation.

## 13. Tests

**Passed: 168 tests. Failed: 0 in the final run.** The selected regression run includes shared overlay, classification, layout, target/geometry tests and teacher/student submission integrations. New tests cover responsive metrics, desktop preservation, retained correction objects, unchanged geometry, bounded mobile placement and resizing across breakpoints while image width stays fixed.

Browser QA covers 48 fixture/viewport cases per before/after pass; an additional pass replaces the six-correction handwriting sample with the 42-correction stress overlay. Separate interaction checks verify expanded tap areas, selection dimensions and landscape behavior.

The former CSS-literal test was replaced with rendered sizing checks, because presentation now comes from shared metrics rather than hard-coded media-rule heights. It also exposed a fixed-image-width resize edge case: the existing guard needed to recalculate when the badge-size class changes even if image width does not. That guard now checks both conditions. No regression expectation for correction geometry or content was removed.

## 14. Build

TypeScript: **PASS**. Angular production build: **PASS**, with existing dependency/budget warnings.

Changed-file lint: runtime sizing files and new metrics tests are clean. The existing overlay spec has **six baseline lint findings** (two array-style findings and four explicit-any findings); unrelated lint debt was not fixed.

Diff check: **PASS**, with only Git's existing LF/CRLF notices.

## 15. Screenshot Paths

Private workspace artifacts are under `output/mobile-badge-size/`:

| Viewport | Before dense handwriting | After dense handwriting |
|---|---|---|
| 1440 | `before-handwriting/real-1440.png` | `after-handwriting/real-1440.png` |
| 430 | `before-handwriting/real-430.png` | `after-handwriting/real-430.png` |
| 390 | `before-handwriting/real-390.png` | `after-handwriting/real-390.png` |
| 375 | `before-handwriting/real-375.png` | `after-handwriting/real-375.png` |

Unmodified six-correction sample screenshots are in `before/real-*.png` and `after/real-*.png`. Synthetic dense pages are `before/dense-*.png` and `after/dense-*.png`. Landscape selection is `after/landscape-430-selected.png`. `comparison.json`, `final-qa.json` and `after/interaction.json` contain measurements.

Before rendering uses the preserved pre-change Angular bundle; after rendering uses the current component. Private images were not committed or uploaded.

## 16. Final Verdict

**READY FOR CONTROLLED QA**, subject to the recorded baseline lint debt and normal authenticated-device QA. This change addresses badge presentation only; known source-box limitations remain outside its scope.

## 17. Follow-up: smaller phone badges (2026-10-04)

The follow-up changes only phone presentation metrics and their regression expectations. CSS continues to consume the same TypeScript metrics through custom properties.

| Viewport | Badge height | Font size | Horizontal padding | Effective tap region |
|---|---:|---:|---:|---:|
| 430px | 20px | 8px | 3.5px | 40px minimum |
| 390px | 19px | 7.5px | 3.5px | 40px minimum |
| 375px | 19px | 7.5px | 3.5px | 40px minimum |

Phone width allowance decreases from 10px to 9px to match two 3.5px padding edges and two 1px borders. Minimum widths, character-width estimates and maximum widths are retained. Existing collision clearance, edge clearance and vertical offsets retain their previous values independently of the smaller visible height. Grouping, placement algorithms, geometry, correction data and behavior are unchanged. All metrics above 480px are unchanged.

Validation: 168 selected overlay/layout/submission tests pass, TypeScript passes, production build returns exit code 0 with existing budget/CommonJS warnings, and diff check passes. Browser QA covers 48 cases across six widths, including the existing handwriting sample with visual stress annotations. All cases have zero visible badge collisions, zero out-of-bounds badges, unchanged correction counts and unchanged image-stage widths. Full recorded measurements at 768px, 1024px and 1440px match the previous pass.

Phone interaction checks confirm a 40px CSS tap region (small-width computed values can round to 39.9688px), zero intercepted visible badge centers, text fitting within badge borders, and successful expanded-area tapping in 430px landscape without changing image-stage or selected-badge dimensions. Private evidence for this follow-up is in `output/mobile-badge-size/polish/`: `metrics.json`, `stress-interaction.json`, `summary.json`, `real-430.png`, `real-390.png`, `real-375.png` and `landscape-430-selected.png`. No API, AI or OCR calls or database writes were made.
