# COMARKER OCR GEOMETRY + CORRECTION TARGET AUDIT

## 1. Executive Summary

**Verdict: NO IMPLEMENTATION YET.** Read-only audit completed on 2026-10-04 using the same existing handwritten sample: 141 words and six mapped corrections on the first file. The submission also contains a second file with 145 words and two corrections. No OCR, AI, regeneration, or database mutation was performed.

Three findings must remain separate:

- **Geometry:** the title boxes already overlap the following handwritten line in stored OCR data. All 286 boxes survive current canonical normalization unchanged; the first file's API rectangle conversion has zero numerical drift. Raw Vision polygons, symbol boxes, and OCR page dimensions were not retained. The first faulty upstream operation cannot therefore be proven.
- **Targeting:** all six stored correction targets exactly equal the words intersecting their quoted character ranges. A punctuation correction targets 12 words over three rendered line groups because its full evidence sentence also serves as its visual target. There is no independent punctuation boundary/target contract.
- **Orientation:** the original sample is a 450 × 564 PNG without an EXIF orientation tag. No evidence identifies EXIF as this sample's cause. Local EXIF tests demonstrate a potential coordinate-frame difference, but Vision's behavior was not tested.

Additional findings: backend fallback line reconstruction merges the first two handwritten lines; the frontend also groups one cross-line punctuation target into one line key, although it draws two separate segments. Stored low word confidence does not reach the canonical mapper's expected confidence fields.

## 2. Current Pipeline

| Stage | Implementation | Coordinate/data operation |
|---|---|---|
| Upload | `backend/src/middlewares/upload.middleware.js`, `upload.service.js`, `file.controller.js`, `models/File.js` | Disk upload; validate MIME/signature; canonicalize extension/path. No image resize/reencode/rotation in this path. |
| OCR | `backend/src/services/visionOcr.service.js`, `extractOcrFromImageFile`, `detectDocument` | Read source dimensions; send stored image file to Vision; prefer returned page dimensions for word normalization. |
| Rectangle | `bboxFromVertices` | Pixel quadrilateral → min/max axis-aligned rectangle → percentages. |
| Persistence | `backend/src/services/ocrPipeline.service.js`, `runOcrAndPersistForFiles` | `{x,y,w,h}` → `{x0:x,y0:y,x1:x+w,y1:y+h}`; assign file/page/index word ID. |
| Canonical transcript | `ocrWordIdentity.js`, `ocrTranscriptNormalizer.js` | Preserve boxes; align words to authoritative raw text, or reconstruct fallback reading order. |
| Corrections | `semanticWritingCorrections.service.js`, `correctionCanonical.service.js` | Exact quote + occurrence → character range → all intersecting words. |
| API | `canonicalCorrectionResponse.service.js`, `submission.controller.js`, `ocrCorrections.service.js` | Resolve canonical IDs, scope file, convert corners back to size; response page dimensions are null. |
| Overlay | `annotation-geometry.ts`, shared `CorrectionOverlay` | ID lookup, geometric line groups, percentage segments; underline below source box bottom. |

Source references are relative to the workspace; frontend component files are under `RoznaComarker/src/app/components/correction-overlay/`.

## 3. Image Orientation Pipeline

**Uploaded pixels:** code preserves image bytes, apart from filename/extension handling. The stored sample's SHA-256 is `7a1c97d123a6353357879f431f2871491935a86c19e353c228f598cb8731e5ef`; it exactly matches the prior Annotation UI V2 sample. Original pre-upload client bytes were not available for a separate hash comparison.

**EXIF:** upload does not normalize or strip it through reencoding. The sample PNG has no orientation tag.

**OCR orientation:** no explicit physical rotation before Vision. Provider interpretation of EXIF remains unknown for this historical request.

**Browser orientation:** teacher/student fetch the original private asset as a blob, then create an object URL. Neither path physically rotates or reencodes it. Browser decoding can honor orientation metadata.

`submissionFeedbackReport.service.js` uses Sharp `.rotate()` for report image preparation; that is a separate path from the original image used by OCR and the annotation component.

## 4. OCR Coordinate System

Active code reads `word.boundingBox.vertices`, not `normalizedVertices`. Width/height are `page.width/page.height` when populated, with source dimensions as fallback. Geometry is normalized to **0–100 percentages**, not 0–1.

Vision defines word bounding boxes as quadrilaterals with vertex ordering tied to natural text orientation. This permits rotated geometry; it does not prove that any specific historical polygon was oversized. [Google Vision response reference](https://docs.cloud.google.com/vision/docs/reference/rest/v1/AnnotateImageResponse).

Raw polygons and OCR dimensions are unavailable for both historical pages. Source and browser dimensions for the first image are 450 × 564. The second image's source/browser dimensions were not independently loaded; its metrics below remain percentages.

## 5. bboxFromVertices Audit

```text
x = 100 * min(vertex.x) / width
y = 100 * min(vertex.y) / height
w = 100 * (max(vertex.x) - min(vertex.x)) / width
h = 100 * (max(vertex.y) - min(vertex.y)) / height
```

Each component is independently clamped to [0,100]. No rounding, integer conversion, width/height swap, or rotation transform occurs. Nonpositive/nonfinite dimensions return null. Omitted coordinate components become zero, consistent with omitted protobuf zero values; malformed null vertices also become zero. Nonfinite coordinates are filtered independently.

Independent clamping does not guarantee `x+w <= 100` or `y+h <= 100` for malformed/out-of-range polygons. Pixel and normalized vertices are not interchangeable. No evidence shows either case occurred in this sample.

**Controlled calculation using the actual function:** a 120 × 20 pixel rectangle rotated 3°, 7°, and 12° yields axis-aligned heights 26.25, 34.48, and 44.51 px: 1.31×, 1.72×, and 2.23× the unrotated height. This proves the conversion can expand vertical extent; it does not prove the historical title polygon was rotated. At 90°, its AABB is 20 × 120 px, as expected in the same coordinate frame.

## 6. Real Misaligned Word Evidence

Raw Vision box: **unavailable for every row**. IDs below use prefix `word_6abc3c1eff175e10d6496b04_1_`; the table suffix completes the exact word ID. Source dimensions: 450 × 564.

| Suffix | OCR text | Persisted corners, percentages | Source-pixel rectangle (x,y,w,h) | Observation / classification |
|---|---|---|---|---|
| `2` | In | (11.3333,9.0426)–(17.7778,14.0071) | (51,51,29,28) | Box bottom 79 intersects the following handwritten line; upstream classification unresolved. |
| `3` | The | (19.7778,9.0426)–(29.1111,14.0071) | (89,51,42,28) | Same excessive lower extent. |
| `4` | Story | (30.6667,9.0426)–(44.8889,14.0071) | (138,51,64,28) | Same lower extent; descender makes ink-height comparison word-dependent. |
| `7` | Hour | (61.7778,8.8652)–(74.2222,14.0071) | (278,50,56,29) | Same bottom despite different ink shape. |

Visual estimate for “In”: main ink is approximately y=53–70; the following handwritten line begins around y=74. These are manual estimates, not segmented ground truth. The private diagnostic `real-word-box-overlay.png` displays stored rectangles directly on original pixels.

At a 1000 px rendered width, “In” maps to approximately x=113.33, y=113.33, w=64.44, h=62.22 CSS px, relative to the image. Its box bottom is approximately 175.56 px. The local segment adds a bottom clearance of at least 1.5 CSS px or 12% of box height; a title group using a 29 px source height lands around source-equivalent y=82.48. This clearance amplifies an existing box problem but does not explain why the stored rectangle reaches the next line.

## 7. Google Vision Geometry Quality

**Not attributable from retained evidence.** The adapter directly consumes the word polygon, but discards it after min/max conversion. Current storage cannot distinguish an already oversized Vision polygon from AABB expansion, historical dimension mismatch, or an earlier implementation difference.

The provider hierarchy is Page → Block → Paragraph → Word → Symbol. Current code retains word text, a paragraph index, rectangle, and a confidence aggregate; it does not retain symbol geometry or detected-break structure. [Google Vision response reference](https://docs.cloud.google.com/vision/docs/reference/rest/v1/AnnotateImageResponse).

## 8. Symbol vs Word Geometry Experiment

**Blocked by missing raw symbols.** No old-y/h versus symbol-union-y/h comparison is possible for these words. No claim that symbol union improves the sample is justified. A fresh, separately approved OCR diagnostic would need to preserve both representations before comparing them against visible ink. It must not overwrite this submission.

## 9. Persistence Integrity

**Geometry changed after Vision: UNKNOWN.** No historical pre-persistence payload exists for comparison.

Current persistence code performs corner conversion only; it changes IDs to a file/page/index identity and retains confidence/paragraph index. OCR page dimensions are dropped when constructing the stored page. `Submission.ocrPages` contains file/order/page metadata, text/rawText and mixed words, without source/ocr dimensions or orientation metadata.

**Stored → current canonical:** 286/286 matched by ID, zero box differences. **Stored → first-page API adapter:** maximum numeric error 0 over 141 words. These measurements do not prove the unavailable Vision → storage boundary.

## 10. Canonical Word Identity

**Geometry changed: NO in the measured replay.** Existing canonical IDs survive. Fallback IDs may be generated for legacy words, without recomputing their rectangles.

Authoritative `rawText` is preferred for these pages. Alignment scans tokens forward, case-insensitively, and preserves their boxes. It can skip unmatched tokens; it is not fuzzy OCR correction and does not require token-boundary matching. Here all 141 + 145 words align.

Fallback reconstruction sorts by geometry and x-position, reconstructs paragraphs, and can remove detached margin glyphs. It never widens/merges word boxes. However its line clustering uses overlap with **any** existing line member; the first reconstructed group contains both the title and the next handwritten line. This can alter fallback reading order. It does not alter the authoritative transcript selected for this sample.

## 11. Correction Targeting

Stored version: `canonical-7-code-authoritative`; current code: `canonical-8-source-grounded`. Git version `e995c676` contains the same range-intersection mapping in version 7. All six first-file records have source `AI`, category `MECHANICS`, and valid mapped IDs. No semantic correction exists on this first file.

| Canonical correction ID | Code | Words | First → last token | Frontend line keys / segments | Visually covered lines |
|---|---|---:|---|---|---:|
| ai_7d8c8f0ad01136c2 | CAP | 7 | I → Hour | 1 / 1 | 1 |
| ai_16053ef700673150 | P | 3 | strong → influence | 1 / 2 | 2 |
| ai_1b14534c5f6a100b | P | 4 | obedient → and | 2 / 2 | 2 |
| ai_72be654276b6f91a | P | 3 | hearing → about | 2 / 2 | 2 |
| ai_2bc7f45a16edbc38 | P | 3 | husband → death | 1 / 1 | 1 |
| ai_a24f7b6bffc23e5a | P | 12 | she → . | 3 / 3 | 3 |

All six quotes exactly match their saved character ranges. Current pure range replay returns **identical word IDs for 6/6**. The broad target is present before frontend rendering. API valid-ID handling does not add context in this sample.

## 12. Punctuation Targeting

The mapping expression is:

```js
correction.startChar < span.end && correction.endChar > span.start
```

There is no special `P` branch, explicit anchor word, or boundary offset. The 12-word correction stores a whole-sentence quote; all 12 overlapping OCR tokens become targets. The mapper does not add neighboring words to disambiguate. It faithfully maps an overly broad visual contract.

Prompt/schema request an exact source quote, occurrence index, code/category, replacement (`suggestedText`), message, confidence, severity and correction kind. They do not provide independent evidence IDs, target IDs, or punctuation anchor fields. Localized errors are instructed to use minimal evidence; only global content/organization issues may be global. Current SP validation additionally requires a whole single token. Other local codes, including CAP/P/AGR/WC/ART/PREP, have no equivalent general narrow-target guard.

Raw AI output was not recovered. The persisted AI-source quote and both mapper versions prove how the broad stored target is formed; they do not prove precisely what the original provider JSON contained before validation.

Repeated exact phrases require an occurrence index; otherwise multiple matches return null. Apostrophes, contractions and OCR spelling are matched as source text, not corrected or fuzzily expanded. Multiword quotes intentionally map all intersecting tokens. Newline normalization can change transcript spacing; it is handled before ranges are computed. An insertion between words has no independent representable anchor in this contract. Inferring its unique location from a broad suggested replacement would need ambiguity handling.

## 13. OCR Error vs Student Error

The image appears to contain a possessive mark in “husband’s”, while OCR separates an `&` token; the title also contains an OCR `I` before “In” without an obvious separate handwritten word. These require human/provider verification and must not be treated as certain student errors merely because a correction was generated.

Word confidence exists for 286/286 words. Vision adapter confidence is the minimum numeric **symbol** confidence, defaulting to 1 when no numeric symbol confidence is present. It is not the provider's word-confidence field.

Canonical spans retain confidence on `span.word.confidence`; `mapOffsetsToWords` reads `span.ocrConfidence`. The active canonical pipeline does not promote it. All six stored correction OCR confidences are null and `ocrSuspect` is false; replay also produces null. Their actual minimum word confidences are 0.437, 0.449, 0.567, 0.472, 0.516 and 0.349. The API word projection also drops confidence. This is a proven propagation gap, separate from geometry and broad targeting. It does not by itself prove any particular correction invalid.

## 14. EXIF Tests

Local copies only; Chrome headless used the actual image decoder. No Vision requests.

| Physical rotation | Encoded dimensions | Browser natural dimensions | Formats |
|---|---|---|---|
| 0° | 450 × 564 | 450 × 564 | PNG/JPEG/WEBP |
| 90° | 564 × 450 | 564 × 450 | PNG/JPEG/WEBP |
| 180° | 450 × 564 | 450 × 564 | PNG/JPEG/WEBP |
| 270° | 564 × 450 | 564 × 450 | PNG/JPEG/WEBP |

| JPEG EXIF tag, unchanged pixel dimensions | Browser natural dimensions |
|---|---|
| 1 | 450 × 564 |
| 3 | 450 × 564 |
| 6 | 564 × 450 |
| 8 | 564 × 450 |

EXIF copies all encode a 450 × 564 raster; tags 6/8 swap browser dimensions without physically rotating stored pixels. Dimensions alone cannot detect a 180° disagreement. Vision dimensions, raw word boxes and resulting normalized Vision coordinates are **unknown in all rows**. Thus these tests establish decoder behavior, not end-to-end OCR/browser agreement. No original file was altered.

## 15. Perspective / Curved Image Tests

Diagnostic copies were forward-warped locally, with known stored rectangles transformed into corresponding AABBs. Rotation uses a fixed canvas (edge clipping is possible), perspective uses a small taper, and curve uses a 5 px sinusoidal vertical displacement. These are stress experiments, not new OCR fixtures or quality benchmarks.

| Transform | Mean/max stale-box center error, px | Mean transformed AABB height ratio | Backend reconstructed groups |
|---|---|---:|---:|
| Original | 0 / 0 | 1.000 | 22 |
| 3° | 8.61 / 15.21 | 1.112 | 2 |
| 7° | 20.09 / 35.48 | 1.255 | 1 |
| 12° | 34.40 / 60.75 | 1.427 | 1 |
| Perspective | 7.80 / 18.77 | 1.033 | 9 |
| Mild curve | 3.77 / 5.00 | 1.040 | 21 |

Stale-box error means deliberately leaving coordinates unchanged while transforming the image. The application did not do that in the observed sample. Transformed coordinates were used for the grouping column. The overlap-based fallback grouping is unsuitable for these rotated examples: neighboring-line overlap chains merge groups. Canonical IDs and correction membership remain unchanged by construction. Vision recognition, provider reading order, and correction-generation behavior were not measured. Current system acceptability for genuinely rotated uploads remains unproven.

## 16. Browser Layout Verification

The existing shared Angular component was rendered with the actual sample in a loopback-only harness. At viewport widths 1440, 1024, 768, 430, 390 and 375, rendered image widths were 1000, 992, 736, 398, 358 and 343 CSS px. At DPR 1 and 2, all twelve runs had **zero image/stage rectangle delta**. Natural dimensions stayed 450 × 564. Computed image padding was 0, transform none, zoom 1; `width:100%`, `height:auto`, `max-width:100%` preserved aspect ratio. No contain-letterbox offset exists in this component.

**Teacher:** original selected file URL → authenticated blob → object URL → shared overlay. **Student:** original file URL → memoized authenticated blob → object URL → shared overlay. Secure backend serving uses `sendFile` with `private, no-store` and authorization checks; this path does not resize assets. No thumbnail replacement was identified in either overlay path.

Existing teacher/student integration tests passed. Full authenticated routes and arbitrary ancestor transforms/browser zoom were not exercised in this audit; the shared-component harness cannot prove every page-shell condition.

Frontend line membership has a separate limitation: “strong”/period and “influence” overlap vertically by 5 px; 25% of the shorter 19 px box is 4.75 px. `sameLine` therefore returns true although the image places them on successive lines. Nonadjacent ordering after x-sort produces two segments, so the line-key count understates visual lines here. This is not a coordinate-scale error.

## 17. Data Quality Metrics

Heights are percentages of page height. Quantiles use sorted nearest-lower index `floor((n-1)*q)`. “Next line” means the **backend's reconstructed groups**, not independently labeled handwritten lines.

| Metric | File 1 | File 2 |
|---|---:|---:|
| Words | 141 | 145 |
| Median height | 3.9007% (22 px on file 1) | 3.9007% |
| p90 | 4.6099% (26 px) | 4.4326% |
| p95 | 4.9645% (28 px) | 4.4326% |
| Height > 1.6× page median | 0 / 141 | 0 / 145 |
| Height > 1.6× own group median | 0 / 141 | 0 / 145 |
| Boxes overlapping next group center | 0 | 0 |
| Boxes vertically intersecting next group band | 94 (66.7%) | 109 (75.2%) |
| Mean stored confidence | 0.8613 | 0.8843 |
| Backend reconstructed groups | 22 | 23 |

First-file corrections: local targets >3 words **3/6**; punctuation >3 words **2/5**; >1 frontend line key **3/6**, but visibly covering >1 handwritten line **4/6**. The two second-file corrections are outside the selected six-correction overlay scope.

**Heuristic quality:** height-ratio flags miss uniformly oversized neighboring title boxes. Next-center flags also miss the example because line reconstruction has already merged the title and next line. Next-band overlap is common and cannot be treated as a precise error detector. Narrow punctuation tokens naturally have extreme aspect ratios, so aspect ratio alone would generate false positives; no validated aspect-ratio threshold is claimed.

**Baseline experiment:** median box-bottom for title words is around y=79, the same faulty lower edge. An estimated baseline from those boxes would not fix the issue. A visual ink baseline would need separate reliable evidence; choosing one manually would merely hide the bad geometry. No production underline/baseline adjustment was made.

## 18. Root Cause A — Geometry

| Issue | Source image | Vision | Persisted geometry | Correction target | Frontend | Proven conclusion |
|---|---|---|---|---|---|---|
| Title rectangle reaches next handwritten line | Visible in original PNG | Raw vertices missing | Already overlaps next line | Seven title tokens | Scales stored box; adds documented clearance | Source-data defect observable, first upstream cause unresolved |
| Rotated synthetic AABB grows | Controlled transform | Not called | No persistence | IDs held fixed | Not cause of conversion | VERTEX_TO_RECT_CONVERSION_EXPANDS_BOX proven for synthetic math only |
| First two lines share fallback group | Distinct visible lines | Break structure discarded | Boxes unchanged | Authoritative text still selected | Separate frontend heuristic also permissive | OTHER: overlap-chain line grouping limitation |
| Strong/influence line key merge | Two visible lines | Not needed for this test | 5 px vertical overlap | Same three target IDs | `sameLine` threshold passes | FRONTEND_GEOMETRY_BUG limited to line classification; not box scaling |

Do **not** assign GOOGLE_VISION_BOX_ALREADY_OVERSIZED, IMAGE_DIMENSION_MISMATCH, EXIF_ORIENTATION_MISMATCH, NORMALIZATION_BUG or PERSISTENCE_MUTATION to the real title from this evidence. No API geometry mutation was observed.

## 19. Root Cause B — Correction Targeting

**Proven classification: evidence span and visual target are conflated.** The saved broad quote maps to the same broad IDs in both the historical version-7 algorithm and current version-8 replay. No punctuation anchor exists. The renderer is not adding the twelve-word scope, and API fallback is not needed for these six records.

The precise original AI response is unavailable, so attribution is to the retained correction contract and deterministic mapper, rather than an unobserved provider message. The confidence-field propagation gap is an additional independently proven defect.

## 20. Historical Data Impact

New dimension/orientation fields alone cannot reconstruct historical polygons. Symbol-union geometry requires historical raw symbols or an explicitly authorized new OCR result. Existing AABBs cannot recover a lost quadrilateral or an ink baseline.

Evidence/target separation can preserve old records with existing `wordIds` as a fallback. Exact historical punctuation anchors might be derivable for unambiguous source/replacement edits, but ambiguous cases need review; do not silently rewrite them. A line-grouping improvement could affect historical display without OCR, but must preserve IDs, offsets and saved grading results. No migration or regeneration was performed.

## 21. Fix Options

| Option | Benefit | Risk / compatibility / migration | Runtime cost / external calls |
|---|---|---|---|
| A: retain source/OCR dimensions, orientation applied, bounded geometry provenance | Makes future coordinate-frame audits possible | Additive optional fields; old pages remain unknown; no mandatory backfill | Small per-OCR metadata/storage cost; no extra AI/OCR call |
| B: conditional symbol-union geometry | Potentially tighter boxes | Not justified until raw comparison; may omit legitimate marks; historical re-OCR needed if symbols absent | Union during existing OCR pass; no per-view call |
| C: distinct evidence and visual target contract | Allows contextual explanation with narrow marks | Versioned schema/validation and legacy fallback; incorrect narrowing could misidentify errors | Validate in existing generation pass; no extra AI call required |
| D: explicit punctuation boundary/anchor | Represents insertions/deletions precisely | Ambiguous edits must fail conservatively; preserve legacy display until verified | Small deterministic mapping cost; no per-view AI/OCR |
| E: explicit one-time EXIF normalization before both OCR and display | Consistent pixel frame | Not proven necessary for this sample; image hashes/paths and historical compatibility require care | One upload-time decode/encode; no browser CV |
| F: no geometry change until raw evidence | Avoids unsupported box manipulation | Existing title artifact remains | Zero cost |
| G: propagate confidence and review line-grouping rules separately | Restores uncertainty metadata; avoids proven line merges | Missing confidence must stay unknown; changed groups can affect reading order; regression review required | Linear metadata pass; grouping cost depends on chosen algorithm; no new external calls |

No option has been implemented. None should mutate payments, entitlements or grading history.

## 22. Recommended Minimal Fix

**DO NOT IMPLEMENT in this audit.** Proposed sequence for approval:

1. Address the proven confidence-field mismatch and specify separate narrow visual targets/punctuation anchors, retaining existing evidence and legacy fallback. Validate on the same six records without overwriting them.
2. Investigate line grouping with the demonstrated real and transformed cases; treat fallback transcript ordering and frontend line classification as separate consumers.
3. Before selecting a source-box fix, obtain an approved isolated diagnostic OCR response for this same image, preserving raw word/symbol polygons and dimensions. Do not update the submission. Compare raw polygons, AABBs and symbol unions against the original ink.
4. Consider additive geometry provenance for future OCR runs. Do not automatically re-OCR or migrate historical data.

A CSS height reduction or upward underline shift is not supported by this evidence.

## 23. Tests Run

**Passed:** 6 existing backend suites, **93 tests**: assessment reliability (including Vision adapter/bbox behavior), OCR file order, transcript normalizer, canonical corrections, correction statistics and canonical two-image lifecycle.

**Passed:** **155 existing frontend tests** selected from shared correction-overlay specs and teacher/student submission integration specs.

**Failed test assertions:** none. No tests were added or edited. Local diagnostic scripts are experiments, not replacements for regression suites. The transform command emitted a dependency deprecation warning that PowerShell treated as native stderr; its browser run completed and wrote all 16 format/orientation cases and five transformed-copy results. This is not recorded as a passed test suite.

Additional diagnostics: 286 canonical box comparisons; 141 API box comparisons; six correction-range replays; twelve browser layout measurements. SHA-256 verification of 1,092 existing source/test files found **zero changes** during this audit.

## 24. Performance

Additional runtime calls introduced into the application: **0**. Audit OCR calls: **0**. Audit AI calls: **0**. Diagnostics used a projected read-only Mongo fetch, local pure service invocations, image copies and a loopback browser harness. No per-view image processing or browser CV was added to the product.

## 25. Security / Privacy

No account identifiers, credentials, public image URLs or full essay text are included in this report. Word/correction IDs and minimal excerpts are used only to identify evidence. Source images, local projected snapshot and diagnostics remain private workspace artifacts, outside either repository's tracked source tree. They were not committed or uploaded. No permanent application debug logging was added.

Database writes: **0**. Original source-image mutation: **0**. Runtime/test edits in this audit: **0**. Pre-existing working changes were preserved.

## 26. Remaining Unknowns

- Historical raw Vision polygons, symbol geometry, page dimensions and provider EXIF treatment.
- Exact pre-persistence image/geometry payload and original AI response.
- Second image's independently verified source/browser dimensions.
- Full authenticated teacher/student route geometry, arbitrary zoom/ancestor transforms, and provider behavior on controlled rotated/perspective images.
- Independently labeled ink polygons/baselines and line ground truth; heuristic metrics are not precision/recall measurements.
- Whether symbol union would improve the actual title without clipping legitimate writing.

Percent coordinates are adequate for scaling when OCR and displayed pixels share the same frame. They are insufficient to reconstruct a lost frame/orientation history.

## 27. Final Verdict

**F. BLOCKED BY MISSING EVIDENCE** for the exact upstream geometry cause and selection of a safe source-box fix.

Correction-target conflation, confidence propagation loss and specific line-grouping limitations are proven separately. The audit deliverable is complete; fixes remain unimplemented. Stop for approval before changing behavior or making a new OCR request.
