# COMARKER TARGET PRECISION + OCR EVIDENCE AUDIT

## 1. Executive Summary

Implemented the proven target-contract, confidence-propagation and line-grouping fixes. Source OCR boxes, correction wording, categories, codes, IDs, counts, scoring weights and historical records remain unchanged. One isolated Google Vision request supplied the missing geometry evidence; it did not run the submission pipeline or write a database document.

The real 12-word punctuation correction cannot safely be narrowed: its stored source and suggestion are **identical**. It retains legacy display. Two of the other five real corrections narrow deterministically to punctuation tokens. Synthetic punctuation-only edits demonstrate one correction with multiple precise boundary anchors while preserving its full evidence sentence.

Audit date: 2026-10-04. Implementation remains local and uncommitted.

## 2. Proven Issues Implemented

**Targeting:** additive `visualTarget.version = 1` contract, evidence IDs, deterministic derivation, validation and renderer precedence.

**Confidence:** one authoritative span property, `span.word.confidence`; minimum known evidence confidence; null when unavailable; existing mechanics suspect threshold unchanged.

**Line grouping:** bounded backend fallback groups with a small-slope estimate; frontend requires both vertical agreement and overlap, detects horizontal line wraps, and keeps different line groups disconnected.

The implementation map is:

`semanticWritingCorrections.validateCorrections` → `correctionCanonical.normalizeCorrection` → existing exact quote/range and evidence IDs → `correctionVisualTarget.deriveVisualTarget` → existing guarded `writingCorrections` persistence → `canonicalCorrectionResponse.normalizeCorrectionWordIds` → shared transcript-page/legacy adapters → `annotation-geometry` → existing overlay/layout.

## 3. Correction Contract Before

`quotedText`, `startChar`, `endChar` and `wordIds` jointly represented both contextual evidence and the visual target. Every intersecting word was marked. `bboxList` provided legacy fallback. No explicit punctuation boundary existed.

## 4. Correction Contract After

```js
{
  // Existing fields and meanings are retained:
  quotedText, startChar, endChar, wordIds, bboxList,
  suggestedText, message, symbol, category,
  evidenceWordIds: [...wordIds],
  // Optional; omitted when derivation is unsafe:
  visualTarget: {
    version: 1,
    wordIds: ['changed-canonical-word'],
    anchors: [{
      wordId: 'canonical-anchor-word',
      side: 'after', // or before
      operation: 'INSERT', // or DELETE / REPLACE
      punctuation: ',' // optional
    }]
  }
}
```

Evidence text and range remain in the original fields; no second full text or frontend geometry is stored. The optional metadata is stored with new canonical corrections through the existing mixed correction schema. Existing canonical-generation/layout versions were deliberately not bumped, avoiding forced historical regeneration merely to add presentation metadata.

Renderer precedence: valid explicit target → legacy word IDs → legacy rectangles. Invalid optional targets fall back without removing the correction. Semantic content/organization targets retain their existing broad behavior.

## 5. Punctuation Anchor Design

`backend/src/services/correctionVisualTarget.service.js` aligns exact lexical sequences and compares punctuation gaps between them. Changed gaps must use the supported punctuation set. Lexical rewrites, changed apostrophes/ampersands, missing suggestions, identical suggestions and unsafe insertion locations fall back.

An insertion yields a before/after-word boundary. Deletion/replacement maps the existing punctuation span to canonical OCR token IDs. Punctuation attached to a larger OCR token may still target that token; no character box is invented inside it. Multiple insertions produce several anchors on **one correction record**.

Targets are validated against canonical evidence IDs and file/page ownership. The API revalidates IDs against canonical spans. No page text search, additional AI request, or provider target hint is used. The existing AI prompt/schema/provider chain is unchanged.

## 6. Local Word-Level Targeting

SP retains its exact single canonical word. Other local codes use a bounded, uniquely positioned contiguous edit and map only changed source tokens. Short replacements such as “students was” → “students were” target “was”; preposition replacement targets the preposition. An unambiguous article insertion uses a boundary. Repeated/ambiguous alignments and edits spanning more than three source tokens retain legacy scope.

This deliberately does not attempt a fuzzy rewrite, guess a missing edit from the explanation, or split one correction into several semantic records.

## 7. Real Six-Correction Replay

The same stored six corrections were replayed in memory against the existing canonical transcript. Nothing was saved to the submission. IDs below identify corrections, not accounts.

| Correction ID | Code | Evidence words | Old target | New effective word target | Anchors | Unsafe/ambiguous fallback |
|---|---|---:|---:|---:|---:|---|
| ai_7d8c8f0ad01136c2 | CAP | 7 | 7 | 7 | 0 | YES: ambiguous deletion around repeated OCR `I`/`In` prefix |
| ai_16053ef700673150 | P | 3 | 3 | 1 | 0 | NO: existing punctuation token |
| ai_1b14534c5f6a100b | P | 4 | 4 | 4 | 0 | YES: lexical change prevents punctuation-only derivation |
| ai_72be654276b6f91a | P | 3 | 3 | 1 | 0 | NO: existing comma token |
| ai_2bc7f45a16edbc38 | P | 3 | 3 | 3 | 0 | YES: possessive/OCR lexical ambiguity |
| ai_a24f7b6bffc23e5a | P | 12 | 12 | 12 | 0 | YES: identical source and suggestion; no edit can be inferred |

The final row's sentence evidence remains intact. No precise location is claimed for it. A separate tested sentence with a semicolon and comma insertion retains all evidence words but has zero word underlines and two boundary ticks under one correction/detail card.

## 8. Confidence Propagation

Before: all six stored correction OCR confidences were null and `ocrSuspect` was false. After in-memory aggregation, minimum evidence-word confidences are **0.437, 0.449, 0.567, 0.472, 0.516 and 0.349**. These values cross the existing mechanics threshold `< 0.7`; the corrected metadata can report uncertainty without hiding the correction.

The policy remains minimum **evidence-word** confidence, matching the original intended all-mapped-words rule. Missing/null/nonfinite/out-of-range values are excluded; if none remain, confidence is null. It is not an average. Canonical spans and the legacy span builder now use `word.confidence` consistently.

**Grading compatibility:** the existing rubric scorer treats `ocrSuspect` as an exclusion flag. Simply fixing propagation would have changed grading. New mechanics corrections therefore carry `ocrSuspectForScoring: false`, preserving the pre-fix active canonical pipeline's eligibility while exposing corrected uncertainty metadata. The scorer honors that explicit compatibility field, falling back to the historical `ocrSuspect` behavior for old records. Tests verify both cases. No weight, deduction formula or historical score was changed. This is compatibility plumbing, not adoption of confidence-based grading.

## 9. Backend Line Grouping

Before: overlap with any group member could merge adjacent physical lines transitively. The real first group contained title and next-line words; the first page had 22 reconstructed groups.

After: estimate a small slope from forward OCR neighbors, compare deskewed centers against a fixed group seed and typical height, then sort words left-to-right. A tall joining word cannot move the group's seed or admit an overlap chain. Per-group metadata uses a bounded window. Source boxes are never transformed.

Real replay: **23 groups**, first group contains only the nine title-line OCR tokens. All stored boxes remain identical. The authoritative raw-text path stays authoritative. Tests cover clean/dense lines, overlapping ascenders/descenders, the title case, actual 3°/7° rotated rectangles, perspective and punctuation.

## 10. Frontend Line Grouping

Before: 25% overlap alone could merge “strong” and “influence” despite their different handwritten lines.

After: overlap and center proximity must both agree; a substantial x reset starts a new line even when sloped line endpoints have similar y values. Different line keys cannot be joined by segment construction. The real strong/influence case now has two line keys. Sloped 0°/3°/7° fixtures retain two physical lines.

Boundary targets render compact 5 px ticks using the existing annotation colors and selection/detail machinery. Existing local underlines, semantic rails, grouping and responsive UI remain in place. No source box or CSS box height was shrunk.

## 11. Legacy Compatibility

Old canonical-7 data loads without new fields. Historical `wordIds` and rectangle fallback remain supported. No response-time derivation silently narrows old records; the real replay is a private diagnostic only. Invalid explicit IDs revert safely to legacy display.

Targets travel through the shared teacher/student page adapter and the remaining legacy teacher/handwritten-OCR adapters. Existing job ownership guards still require matching OCR/correction job IDs for persistence. Whole correction objects, including additive fields, pass through merge/retry persistence. No recovery, resubmission, revision-snapshot or ownership logic was changed.

## 12. Correction Count / Scoring

**Changed: NO.** One correction with two anchors still counts as one. Evidence, canonical ID generation, category/code, messages, suggested text, deductions and statistics are unchanged. Existing scoring eligibility is preserved by the compatibility field described above. Historical records and grades were not rewritten.

## 13. PDF

**Changed: NO.** PDF source/evidence and explanations remain canonical. No PDF runtime code was edited. Existing PDF page-contract tests passed; optional visual metadata does not replace explanation text.

## 14. Isolated Vision Diagnostic

**OCR requests: 1** successful `documentTextDetection` call, with retries disabled. Input was the existing private local image copy. No scoring/correction pipeline or Submission persistence was invoked.

**Database writes: 0. Source image modified: NO.** No rotation variants were submitted to Vision; the original image supplied the necessary evidence without further provider calls.

Locally retained: source dimensions, Vision pages/dimensions, raw word vertices/confidence, symbol vertices/confidence, detected breaks and returned page properties. Credentials and full responses were not printed or committed. The diagnostic request marker prevents accidental reruns of this script.

## 15. Raw Geometry Evidence

Source and Vision page dimensions both equal **450 × 564**. The PNG has no EXIF orientation tag. Coordinates below are source pixels from the fresh diagnostic.

| Word | Raw polygon | Current AABB (x,y,w,h) | Symbol-union AABB | Bottom |
|---|---|---|---|---:|
| In | (51,51), (80,51), (80,79), (51,79) | (51,51,29,28) | identical | 79 |
| The | (89,51), (131,51), (131,79), (89,79) | (89,51,42,28) | identical | 79 |
| Story | (138,51), (202,51), (202,79), (138,79) | (138,51,64,28) | identical | 79 |
| Hour | (278,50), (334,50), (334,79), (278,79) | (278,50,56,29) | identical | 79 |

These rectangles reproduce the stored title rectangles. For “In”, visible main ink is approximately y=53–70, while following-line ink begins around y=74: the polygon extends into the next handwritten line by roughly 5 px. Ink positions are manual estimates, not segmented ground truth. Word confidence for “In” is approximately 0.9803; high confidence does not imply tight geometry.

## 16. Geometry Root Cause

**GOOGLE_VISION_POLYGON_ALREADY_OVERSIZED** for the reproduced title examples.

The returned polygons are already axis-aligned; min/max conversion adds no vertical expansion. Symbol union gives the same rectangles and therefore offers no precision improvement for these examples. Source and provider dimensions agree. This finding applies to this fresh request on the same bytes, which reproduces the historical rectangles; it does not imply all Vision handwriting geometry behaves this way.

Source geometry remains unchanged. A blind symbol-union replacement or CSS adjustment is not justified.

## 17. Future Geometry Metadata

**Implemented: NO.** Raw evidence is retained only in the private diagnostic output. Optional future source/OCR dimensions and polygon provenance remain useful, but no production metadata/storage expansion was needed for these proven fixes. No full Vision response is stored in a submission.

## 18. Database Changes

**Migration: NO. Historical data rewritten: NO.** New optional correction fields use existing mixed-schema storage during future correction generation. No old corrections, OCR pages, payments, entitlements or counters were changed. Tests use their existing isolated fixtures/mocks; the actual submission was only replayed from the read-only snapshot.

Final hash verification covered 101 existing billing/PayPal/plan/promo/adaptive source and test paths: zero changes. The source-image hash is unchanged, and the real submission's in-memory mechanics scoring-eligibility set is identical before/after the compatibility handling.

## 19. Tests

Backend regression: **12 suites / 151 tests passed**, covering targets, confidence, fallback lines, canonical mapping, transcript normalization, OCR adapter reliability, statistics, two-image lifecycle, resubmission, recovery, deduction policy and PDF page compatibility. The final targeted run also passed **4 suites / 50 tests**, including unchanged contractions, identical source/suggestion fallback, physical rotations and semantic job ownership/coordinator behavior. These runs overlap and their test counts should not be added.

Frontend: **170 tests passed**, including explicit target precedence, multiple boundary ticks, invalid target fallback, legacy IDs/boxes, sloped lines, strong/influence, overlay/layout and teacher/student integrations.

After final inflection/apostrophe safety checks, the target-specific suite passed **23/23 tests**. No failed assertions remain in the final runs.

Initial failures exposed a permissive ampersand classification and a sloped line-wrap case; both were corrected. No existing regression expectation was weakened.

TypeScript, the final Angular production build, backend syntax and `git diff --check` passed. Build warnings concern existing bundle/style budgets and CommonJS dependencies. Changed-file lint reports **231 errors / 3 warnings**, all reproduced in the baseline page components: 218/2 in the teacher page and 13/1 in the handwritten OCR page. **Zero introduced lint findings**; the five other inspected target/model/adapter files are clean. The lint gate is therefore not globally green, despite no new lint debt.

## 20. Visual QA

The actual shared Angular component was rendered at **1440, 1024, 768, 430, 390 and 375 px** across clean, dense, narrow, second-page, punctuation, agreement, insertion and real-sample cases: **48 cases**, zero badge collisions, zero out-of-bounds badges, zero page leaks.

Desktop/mobile punctuation renders two compact ticks with one badge/detail record. AGR uses the changed-token target; ART uses a boundary. Real handwriting retains six corrections and five grouped badges, with two punctuation-token targets narrowed. The ambiguous/identical-suggestion historical cases stay broad. Persisted source-box inaccuracies remain visible, as required.

Private screenshots and metrics are under `output/target-precision/visual/`; the previous Annotation UI V2 screenshots provide the before reference. They are not repository assets and were not committed.

## 21. Performance

Additional normal AI calls: **0**. Additional normal OCR calls: **0**. Additional normal API calls: **0**. Diagnostic OCR calls: **1**.

Target derivation is local and bounded to existing short correction excerpts; ambiguous contiguous-edit validation is quadratic in the bounded excerpt length, with a 500-character source guard. Punctuation mapping is linear in tokens plus evidence lookup. Line grouping is sort-bound with bounded per-line metadata work; confidence is a linear pass. No per-view OCR, image processing or browser CV was introduced.

## 22. Security

No credentials, account identifiers, public image URLs or full essays appear in this report. Private diagnostic snapshots/images remain outside tracked repository source. New targets are constrained to canonical evidence IDs and same-file/page ranges; malformed optional metadata cannot delete a correction. No permissions or private-file serving rules changed.

## 23. Remaining Risks

- Existing broad records stay broad until a separately authorized regeneration/review; the real 12-word record has no source/suggestion edit to locate.
- Fresh Vision title polygons are loose; the implemented target fixes do not repair those boxes.
- Punctuation attached to an OCR word and unsafe multi-edit lexical rewrites may retain wider legacy targets.
- The grading compatibility field deliberately preserves old eligibility; adopting corrected confidence for grading is a separate product decision.
- Global slope estimation assumes a dominant modest writing slope and forward OCR order. Multi-column/extreme-curvature layouts are not claimed solved.
- Shared-component visual QA and integration tests do not replace authenticated end-to-end production QA. Existing lint debt remains separately recorded.

## 24. Final Verdict

**CONDITIONAL**: implemented behavior is ready for controlled QA, with deliberate legacy fallback, unchanged source-box limitations and existing lint debt. No deployment or historical-data update was performed.
