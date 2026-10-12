# Upright-image follow-up — 2026-10-12

Historical investigation: the user subsequently approved the existing Google Vision approach. See [ORIENTATION_QA.md](ORIENTATION_QA.md) for the implemented required orientation gate and remaining live-QA limitation. The implementation blocker below has been superseded.

VERDICT: ORIENTATION HARD BLOCKED

ORIENTATION IMPLEMENTATION BLOCKED BY PROVIDER REQUIREMENT — for the existing-stack Vision approach. A paid provider is not theoretically necessary: a new local model is an alternative, but no reliable, calibrated local implementation has been established here. This investigation does not close the orientation gap or claim production readiness.

The follow-up explicitly requires stopping before integrating a paid service. No provider calls, downloads of new models, dependency installs or application-code changes were made. The earlier basic-preflight QA verdict does not imply readiness for the newly mandatory upright-image requirement.

1. **Technique investigated.** Dimensions, EXIF and line-angle geometry cannot reliably distinguish upright handwriting from a 180-degree rotation. Line direction alone also cannot distinguish 90 from 270 degrees. A reading-direction signal or trained orientation model is needed. No heuristic was installed that could misrepresent that uncertainty as an upright pass. Sharp's existing `autoOrient()` normalizes EXIF only on the disposable analysis copy; source bytes remain intact. [Sharp documentation](https://sharp.pixelplumbing.com/api-operation/#autoorient).

2. **Existing dependencies and signals.** Installed backend versions checked: Sharp 0.34.5, canvas 3.2.3, image-size 1.2.1 and @google-cloud/vision 4.3.3. Sharp/canvas provide pixel operations; image-size provides dimensions, not reading direction. No Tesseract executable was found on PATH, and no Tesseract, ONNX, PaddleOCR or OpenCV dependency was found in the project manifests/lockfiles inspected. `src/services/visionOcr.service.js` invokes `documentTextDetection`. Raw word polygons have ordered vertices relative to natural reading direction, including 180-degree rotation; this can support a candidate orientation estimator. The current `bboxFromVertices()` reduces them to min/max axis-aligned bounds and loses that direction. These signals are obtained during OCR after admission, so they cannot simply be reused before the first submission without an earlier provider call. [Vision response specification](https://docs.cloud.google.com/vision/docs/reference/rest/v1/AnnotateImageResponse#Word).

3. **New dependencies.** None added. The local candidates below require new runtime/model assets and representative handwriting calibration. Their availability does not prove reliability on this application's phone photos.

4. **Provider options and tradeoffs.** No paid/external image analysis was invoked. Public documentation was read only.

   | Option | Concrete approach | Cost and tradeoff |
   | --- | --- | --- |
   | Existing Google Vision SDK | Run document text detection on an EXIF-normalized analysis copy; aggregate reliable word-edge angles into 0/90/180/270, returning undetermined when evidence is weak or conflicting. Validate mild tilt and perspective before selecting thresholds. | Uses the existing vendor and SDK, but adds billable OCR and network latency before submission, including rejected/abandoned uploads. Reliability still needs real-photo testing. |
   | Local Paddle document-orientation classifier | Evaluate `PP-LCNet_x1_0_doc_ori`, a four-class 0/90/180/270 model, behind the shared backend evaluator. | No per-image provider fee. Official documentation lists a 7 MB model, but that excludes the inference runtime. Adds model packaging/versioning, runtime/deployment support and calibration work. Published benchmark accuracy is not evidence of this application's handwritten-phone-photo accuracy. |
   | Local Tesseract OSD | Evaluate its orientation-only mode and orientation confidence with the OSD trained data. | No per-image provider fee, but adds a native executable/model deployment dependency. Short and handwritten samples need validation; it is not a demonstrated drop-in solution here. |

   [Vision pricing](https://cloud.google.com/vision/pricing), checked during this investigation: Document Text Detection's first 1,000 monthly units are free, then $1.50 per 1,000 through 5 million units; higher tier $0.60 per 1,000. Existing usage may already consume the free tier. In the present architecture, a naive preview-plus-final-validation integration adds two calls per accepted single-image attempt, before existing assessment OCR; retries add more. Avoiding repeat calls would need a trusted server-side decision cache bound to exact image bytes and policy version, which is additional implementation work. No billing configuration or application prices changed.

   Local references: [Paddle document classifier](https://paddlepaddle.github.io/PaddleX/main/en/module_usage/tutorials/ocr_modules/doc_img_orientation_classification.html), [Tesseract OSD API example](https://github.com/tesseract-ocr/tessdoc/blob/main/examples/OSD_example.cc). Neither was installed or benchmarked.

5. **Confidence and undetermined behavior.** No new detector means no validated confidence threshold. Current orientation still returns `unavailable` with `required: false`; it does not claim a green pass, but it also does not block readiness. The required future behavior is: high-confidence upright passes, high-confidence quarter/half turns fail, weak/conflicting evidence returns required-unavailable and blocks proceeding. A recognizer's text confidence alone must not be presented as calibrated orientation confidence. No fabricated confidence cutoffs were introduced.

6. **Server enforcement.** Existing assignment and QR routes call the shared evaluator before the submission controller. There is currently no automatic orientation decision in it. Therefore a rotated image that passes resolution/exposure can still reach submission, including through a direct API request. No claim is made that this follow-up fixed bypass protection.

7. **Assessment and credits.** Existing basic-check failures remain protected before assessment/credits. Rotated images alone are not currently rejected and can proceed to assessment and normal charging. Nothing in OCR, grading, scoring, credits, pricing, authentication or teacher comments was changed. Any future detector must protect both preview and final server validation before those operations, without invoking the full assessment.

8. **Tests and observed gap.** Re-ran `npm.cmd test -- --runInBand tests/imagePreflight.test.js tests/imagePreflight.routes.test.js`: 26 passed, 0 failed, 0 skipped; exit 0. These are existing basic-preflight tests, not proof that automatic orientation works. A read-only probe rotated `public/img/assignment-info-images/clear-and-straight-photo.png` in memory using Sharp and passed each variant through the current evaluator:

   | Clockwise rotation | Current orientation | Current ready | Required product outcome |
   | --- | --- | --- | --- |
   | 0 degrees | unavailable | true | upright pass |
   | 90 degrees | unavailable | true | fail/block — unmet |
   | 180 degrees | unavailable | true | fail/block — unmet |
   | 270 degrees | unavailable | true | fail/block — unmet |
   | 3, 8, 12 degrees | unavailable | true | upright pass |

   No new ORI-1–ORI-13 acceptance tests are claimed as passing. Existing cancellation and basic rejection tests do not establish orientation-specific behavior. ORI-14/15 remain covered by the unchanged basic evaluator/route tests (resolution/exposure and PDF behavior).

9. **Real-photo QA.** The repository contains a handwriting-page illustration/photo asset, visually inspected, but its camera provenance is unknown. The seven variants above are digital transformations of that one asset, not seven independent phone photos. Three clearly rotated variants remain incorrectly admissible. No detector false-positive/false-negative rate can be measured because no new detector exists. Actual short/dense handwriting, physical perspective, natural tilt and EXIF phone-photo QA was not performed. There is no representative labeled phone-photo set established by this investigation; do not infer production accuracy from these observations.

10. **Remaining manual checks.** Blur, complete page and writing visibility remain honest manual checks. Orientation also remains manual in application code, which is the unresolved mandatory product gap.

11. **Exact files changed this follow-up.** Added only `RoznaComarker/ORIENTATION_INVESTIGATION.md`. Existing uncommitted preflight/password-revert changes were preserved. No implementation or tests were edited.

12. **Build/typecheck/diff checks.** Both repository `git diff --check` commands passed, with ordinary LF/CRLF warnings only. Builds/typechecks were not rerun for this documentation-only follow-up; prior successful build/typecheck results belong to the preceding implementation turn. No commit, push or deployment performed.

13. **git diff --stat.** Existing tracked backend changes remain 2 files, 24 insertions, 1 deletion. Existing tracked frontend changes remain 22 files, 325 insertions, 589 deletions. These numbers include the previous task, not new orientation code. Default `git diff --stat` omits the existing untracked implementation files and this new untracked report. This follow-up contributes one documentation file and zero application changes.

To unblock: choose the existing paid Vision route (subject to the user's explicit stop-before-integration requirement) or a separately evaluated local model/runtime approach, then validate a representative labeled phone-photo set and implement the shared required orientation gate. An external provider is an option, not proof that all local approaches are impossible.
