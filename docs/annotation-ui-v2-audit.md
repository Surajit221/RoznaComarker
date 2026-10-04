# COMARKER ANNOTATION UI V2 AUDIT

Date: 2026-10-03. Scope: shared image annotation presentation only.

## 1. Executive Summary

Implemented precise ID-based local geometry, line-scoped semantic rails, grouped badges, individual grouped correction selection, bounded badge positioning, and selected-state emphasis in the existing shared Angular overlay. No backend, OCR, scoring, billing, or persisted correction changes were made for this task.

The actual Angular component was rendered in Chrome at all six requested widths, including an existing handwritten image with its persisted OCR and corrections. Synthetic density fixtures have no overlapping or out-of-image badges. Real-page alignment is **conditional**: several existing OCR boxes overlap handwriting on the following line, and canonical punctuation spans include broad phrases/sentences. Those data were preserved, not silently narrowed.

## 2. Pre-Implementation Architecture

- Upload/storage: `backend/src/services/upload.service.js`, `backend/src/models/File.js`; stored image bytes are read by the OCR pipeline.
- OCR: `backend/src/services/visionOcr.service.js` (`detectDocument`, `bboxFromVertices`) and `ocrPipeline.service.js` (`runOcrAndPersistForFiles`). Google Vision word boxes become normalized page geometry.
- Word IDs: `backend/src/utils/ocrWordIdentity.js`, `ocrTranscriptNormalizer.js` (`buildCanonicalSubmissionTranscript`); file/page identity is incorporated into canonical IDs.
- Persistence: `Submission.js` stores `ocrPages[].words` and `writingCorrections` as mixed data, including IDs, boxes, code/category and persisted feedback.
- Response: `canonicalCorrectionResponse.service.js` scopes files and normalizes IDs; the OCR/corrections handler in `submission.controller.js` exposes persisted words and corrections to the authorized detail pages. `ocrCorrections.service.js` adapts stored corner boxes to normalized x/y/w/h.
- Frontend: teacher `student-submission-pages` and student `my-submission-page` filter active-file annotations and pass active page-1 OCR words to the same `CorrectionOverlay`. Their transcript/PDF paths remain separate.
- Presentation: `annotation-geometry.ts` derives percentages; `correction-overlay.ts/html/css` handles image loading and the existing detail card. No required API geometry was missing.

## 3. Problems Found

Semantic rendering previously used a single union rail, potentially bridging unrelated lines. Edge badges truncated codes to one letter. Badge collision detection scanned every previous marker and applied offsets after clamping, allowing overflow. Identical strokes lost secondary correction membership during deduplication. There was no grouped correction navigation or selected geometry state. The loaded desktop wrapper retained a loading minimum height.

Browser interaction QA also exposed a delayed-blur race that could close a newly pinned correction. This is fixed and covered by a regression test.

## 4. Visual Classification

Centralized in `annotation-classification.ts`, using the project's official frontend legend, which matches `correctionLegendCatalog.service.js`.

LOCAL: T, VF, AGR, FRAG, RO, WO, ART, PREP, WC, WF, REP, FORM, COL, SP, P, CAP, SPC, FMT.

SEMANTIC: REL, DEV, TA, CL, SD, COH, CO, PU, TS, CONC.

Historical CON/ORG remain semantic aliases. Known codes take precedence over inconsistent category labels. Unknown codes use CONTENT/ORGANIZATION category fallback, otherwise local. Classification never rewrites the canonical code/category.

## 5. Local Error Rendering

Before: sequential supplied IDs, exact-coordinate deduplication, independent badges.

After: resolve valid canonical IDs, deduplicate references, sort by visual line/x, split at unrelated intervening OCR words, new lines, or large gaps. Strokes remain slightly below the supplied boxes. Shared overlapping horizontal intervals retain all correction IDs. No text search is added.

## 6. Semantic Error Rendering

Before: one rail from the first to last mapped box.

After: short rails for the actual affected visual lines; no sentence-wide semantic underlines or colored sentence backgrounds. A correction referencing separated lines does not draw a connecting rail through an unmapped middle line.

## 7. Semantic Grouping

Groups are restricted to the current page. Identical geometry groups directly; other semantic corrections require at least 50% overlap relative to the smaller line set and nearby vertical anchors (within the larger of 5 image-percent units or twice the first rail height). Line-index maps avoid scanning every prior correction.

Same-category groups use the first canonical code plus the additional count, e.g. `DEV +2`. Mixed-category groups use `3 Issues`. This is a display label, not a new correction code. Every original correction remains available in the card.

## 8. Multiple Errors Same Word

Same-target errors share badge/geometry membership. Overlapping local strokes use an interval sweep to render one lane per occupied horizontal interval, preserving selected membership. Nearby local targets on the same visual line can also share a badge at small rendered widths. Local and semantic groups are never merged together.

## 9. Local + Semantic Same Sentence

Local errors retain exact target strokes; semantic errors retain side rails. Their respective groups/cards remain separate. The dense fixture contains both types, overlapping local spans, and multiple semantic corrections on the same lines.

## 10. Selected Error State

Selection strengthens the corresponding strokes/rail and badge. Other annotations remain visible at reduced opacity. Selecting another entry within a group changes the canonical detail and selected geometry; it does not rebuild geometry or change canonical correction counts.

## 11. Tooltip Behavior

Desktop: hover/focus previews, click pins, close/outside pointer/Escape dismiss. A short hover-close delay allows movement into the detail card. Delayed blur cannot close a subsequently pinned correction.

Mobile: tap opens the existing bottom dialog; close/backdrop dismisses. Focus enters the dialog and Tab is contained while modal. Body scroll is restored on close, destruction, and mode changes. Scroll locking includes body padding in the fixed width, preventing the image from widening when the dialog opens; screenshot QA checks that width remains stable. Cards retain canonical explanation, original excerpt, suggestion and optional tip. Group entries are individually selectable buttons.

## 12. Geometry

Word authority: canonical OCR IDs. Valid ID matches override conflicting fallback boxes.

Line grouping uses OCR separators, compatible vertical overlap/centers and x ordering. The gap threshold is the larger of 0.3% of natural image width or 0.85 times the smaller neighboring box height, with proper image-axis conversion. Unrelated OCR positions are never joined merely because the text repeats.

Coordinates remain image percentages. Badge placement uses rendered image width and aspect ratio; the stage is sized by the image, not a taller parent. Image pixels and persisted boxes are never resized/cropped/rewritten to make room for annotations.

## 13. No-Margin Behavior

Rails use the nearer inside image edge when neither OCR margin is sufficient. Badges retain full labels and are clamped by their actual width. A spatial hash checks a bounded set of nearby placements (horizontal shifts up to 96 rendered pixels, with bounded vertical alternatives). Up to two denser grouping retries handle remaining compatible local collisions.

## 14. Wide-Margin Behavior

Semantic rails use available OCR margins. Local badges prefer above their target. No external annotation column or permanent side card is introduced. Extremely crowded or unusually small images remain subject to the bounded placement limits; the tested fixtures do not exhaust them.

## 15. Multi-Page Behavior

The overlay filters by page before resolving IDs. Both existing detail pages filter by active file and provide its page-1 image words. Existing page/file regression tests are retained; the browser fixture switches to page 2 and deliberately includes a wrong-page correction to verify exclusion. This does not add a new PDF page viewer.

## 16. Legacy Correction Fallback

When no valid IDs resolve, valid legacy boxes still render. Boxes are visually ordered and split using the same local/semantic rules. Invalid/missing geometry is omitted safely. A legacy single union box cannot be reconstructed into unknown individual words without inventing geometry; that limitation is preserved.

## 17. Teacher / Student Consistency

Both pages still import the same shared component and use the same pure geometry/layout utilities. Existing teacher/student page integration tests verify their inputs and canonical state. Browser screenshots render the actual shared component in a standalone development harness; they are **not screenshots of fully authenticated teacher/student routes**. Full route visual QA remains a follow-up gate.

## 18. Accessibility

Native badge and group-entry buttons expose canonical labels and counts. Expanded/pressed state and unique per-overlay detail IDs are used. The detail card is a dialog because it contains interactive controls. Keyboard activation, focus visibility, Escape, mobile focus containment, and close behavior are preserved/tested. Meaning is available through codes and text, not color alone. No screen-reader certification is claimed.

## 19. Performance

One word-ID map is built per geometry update. Hover/selection does not rebuild geometry. ResizeObserver schedules at most one pending animation frame, relayouts badges only when rendered width changes, and reuses the normalized geometry. Listeners, observer, hover timer, and layout/position/blur frames are cleaned up.

Complexity is near-linear with sorting: O(W + sum(r log r) + C log C + S log S + M), plus bounded spatial-neighbor work. W is page words, r each correction's references, C corrections, S strokes, and M emitted overlap memberships. Pathologically nested spans can increase M; no strict linear worst-case claim is made. No all-previous-badge scan remains.

Additional application API calls: **0**. Additional AI calls: **0**. Additional OCR calls: **0**. The separate read-only QA export is not application runtime behavior.

## 20. Files Changed

Under `src/app/components/correction-overlay/`: `annotation-classification.ts`, `annotation-geometry.ts`, `annotation-geometry.spec.ts`, `annotation-layout.ts`, `annotation-layout.spec.ts`, `correction-overlay.ts`, `correction-overlay.html`, `correction-overlay.css`, `correction-overlay.spec.ts`.

Also: `scripts/annotation-ui-v2-qa.cjs` and this audit. Pre-existing checkout, PayPal/admin and backend billing changes were preserved and are outside this task.

## 21. Tests

Frontend full focused run: **198 passed**. Includes overlay/geometry/classification/grouping, teacher and student submission pages, canonical result/display utilities, file-box filtering, responsive device classification and result coordination. Coverage includes all 28 canonical codes, exact ID authority, repeated text/discontinuous spans, legacy boxes, pages, grouped membership, selection, keyboard/hover/tap, delayed blur and all six widths.

Backend: **160 passed across six existing suites**: canonicalCorrections, submissionCorrectionStatistics, canonicalTwoImageLifecycle, canonicalResultState, ocrTranscriptNormalizer, submissionFeedbackReportViewModel.

The final focus/scroll-lock cleanup was followed by an additional overlay-only run: **80 passed, zero failed**, followed by the explicit TypeScript check and production rebuild. This is a focused recheck with one additional scroll-lock regression, not 80 additional distinct tests. Karma reported Chrome shutdown warnings after successful execution; this is recorded rather than treated as a test assertion failure.

Logs are in workspace `tmp/annotation-v2-frontend-final.log`, `tmp/annotation-v2-overlay-final.log` and `tmp/annotation-v2-backend.log`. Initial test failures reflected changed display expectations; the browser-discovered focus race received a behavior regression test.

## 22. Responsive Visual QA

Screenshots: workspace `output/annotation-ui-v2/`. Harness bundles the actual Angular TS, template and component CSS; it does not approximate the component with duplicate static markup. Fixtures cover clean handwriting-style text, 30 local + 9 semantic corrections, overlapping targets, narrow margins, mixed categories, multiple lines, page switching and selected details.

| Width | Synthetic badge collisions / out-of-image badges | Representative screenshots |
| --- | --- | --- |
| 1440 | 0 / 0 | `dense-1440.png`, `real-1440.png` |
| 1024 | 0 / 0 | `selected-1024.png`, `real-1024.png` |
| 768 | 0 / 0 | `dense-768.png`, `real-768.png` |
| 430 | 0 / 0 | `selected-430.png`, `real-430.png` |
| 390 | 0 / 0 | `narrow-390.png`, `real-390.png` |
| 375 | 0 / 0 | `narrow-375.png`, `real-375.png` |

Representative screenshots at every requested width were actually inspected. `metrics.json` records bounds, collision, membership and page-leak checks. Synthetic desktop density falls from 39 corrections to 31 badges; mobile density falls to 14 while retaining all 39 corrections.

## 23. Real Handwritten Submission QA

A read-only database export found a locally stored handwritten page with **141 OCR words, six corrections, all six ID-mapped**. The same image and canonical targets were rendered at every width. Six corrections remain accessible through five badges. The browser run opens each real badge and verifies each grouped explanation/suggestion against its original value. No correction, OCR box or database document was changed.

Result: membership and interaction PASS; exact ink alignment CONDITIONAL. For example, a title word box starts around y=9.04% with h=4.96% on the 564px image. Its bottom reaches into the following handwritten line. Drawing below that supplied box consequently crosses unrelated ink. A separate persisted P correction references twelve words across several lines, so faithfully rendering it still produces a broad local target. These are source geometry/targeting findings, not permission to narrow canonical data in the renderer.

The real sample contains CAP/P corrections, so real-image semantic grouping is not independently proven by that sample; synthetic semantic fixtures cover it.

## 24. Existing Functionality Regression

| Area | Result and evidence |
| --- | --- |
| OCR | PASS for unchanged pipeline and normalizer regression; no fresh OCR call |
| Corrections/codes/categories/suggestions | PASS: original references and detail values preserved |
| Counts | PASS: membership tests and canonical statistics suites |
| Scoring | PASS for unchanged scope and canonical result regressions; no rescore |
| Rubrics | PASS for unchanged scope; no rubric editing in this task |
| PDF | PASS for unchanged scope and report view-model suite; no PDF redesign |
| Adaptive Practice | PASS for unchanged scope; not end-to-end exercised |
| Assessment Credits/billing | PASS for unchanged scope; no mutations by this task |
| Teacher/student permissions | PASS for unchanged authorization paths; no new API |
| Teacher/student views | PASS for shared-component integration tests; full route screenshot QA pending |

PASS for unchanged scope is a source-diff guarantee, not a claim that unrelated product flows were exercised live.

## 25. Build

TypeScript app check and Angular production build passed. The build retains existing CommonJS/dependency warnings. Changed runtime TypeScript/template files and new utilities pass lint; existing explicit-any diagnostics in the older spec are baseline debt, with no new diagnostics. Both repository diff checks pass. Build/lint logs are in workspace `tmp/annotation-v2-build-final.log` and `tmp/annotation-v2-lint-final.log`.

## 26. Security

No new endpoints, authentication changes, external services or permanent sensitive logging. Canonical feedback remains Angular-interpolated text. Read-only Mongo access used projections without account/contact fields, disabled automatic collection/index creation and performed zero writes. Local real-image QA artifacts are not added to the application bundle. No credentials or account identifiers are included in this report.

## 27. Remaining Risks

1. Existing oversized OCR boxes and broad canonical local targets prevent an unconditional real-ink alignment PASS. Fixing source geometry/targeting requires a separate evidenced task.
2. Normalized 0/90/180/270-degree fixtures are covered by geometry tests. They do not prove browser/Google Vision EXIF consistency. The OCR and browser orientation pipeline was not changed; fresh rotated photo/EXIF and perspective QA remains unverified.
3. Actual shared-component screenshots and route integration tests are complete; fully authenticated teacher/student route screenshots, physical mobile devices and screen-reader checks remain pending.
4. Legacy union boxes cannot provide missing word-level precision. Extreme density beyond the bounded collision strategy can still require further presentation work.

## 28. Final Verdict

**CONDITIONAL**

The frontend implementation and tested grouping/interaction behavior are ready for controlled review. Do not claim universal real-handwriting alignment or orientation support until the source-box and full-route/EXIF QA gaps above are resolved.
