# Image preflight and password revert — review report

Historical report: required automatic orientation has since been implemented. See [ORIENTATION_QA.md](ORIENTATION_QA.md) for the current behavior, tests, provider costs and remaining live QA. The manual-orientation statements below describe the earlier implementation only.

VERDICT: READY FOR HUMAN QA

This verdict covers the implemented resolution and extreme-exposure gate. Upright orientation, blur, complete-page detection and visible writing are explicitly unavailable automatic checks, shown as **Check yourself**, never green. In particular, sideways images are not automatically rejected. No production settings, commits, pushes or deployments were made.

1. **Upload architecture.** Angular's student class detail page hosts `upload-essay-form` in a desktop dialog or mobile sheet. It supports ordering/removing up to 20 JPG/PNG/PDF files, 10 MB each. `UploadApiService` sends the batch to the assignment submission API. Express authenticates, checks student role, runs Multer/signature validation, storage limits, then the submission controller. The controller persists files/submission and schedules assessment; assessment completion routes credit consumption through the existing credit router.

2. **Existing validation.** Backend extension, MIME, magic bytes, per-file/aggregate size limits and authentication already existed and remain. Backend also accepts WEBP. No reusable preflight orientation, blur, document-boundary or text-visibility detector was found. Existing Google Vision OCR is part of processing, not a free preflight detector. Existing report-generation EXIF handling does not determine whether writing is upright.

3. **Exact password revert.** Frontend commit `b06e27f766fec81dc7417ed21218f3622fe36bcb` introduced the mistaken feature. Its parent `7599f9b` supplies the restored baseline. Restored these nine files:
   - `src/app/auth/auth-error.util.ts`
   - `src/app/auth/auth.service.ts`
   - `src/app/pages/auth/login-pages/login-pages.ts`
   - `src/app/pages/auth/login-pages/login-pages.html`
   - `src/app/pages/auth/login-pages/login-pages.spec.ts`
   - `src/app/pages/students/my-profile-student-pages/my-profile-student-pages.ts`
   - `src/app/pages/students/my-profile-student-pages/my-profile-student-pages.html`
   - `src/app/pages/teachers/my-profile-pages/my-profile-pages.ts`
   - `src/app/pages/teachers/my-profile-pages/my-profile-pages.html`

   Removed these seven feature-only files:
   - `PASSWORD_POLICY_QA.md`
   - `src/app/auth/auth-password.spec.ts`
   - `src/app/auth/password-forms.spec.ts`
   - `src/app/auth/password-policy.util.ts`
   - `src/app/auth/password-policy.util.spec.ts`
   - `src/app/components/password-requirements/password-requirements.ts`
   - `src/app/components/password-requirements/password-requirements.spec.ts`

4. **Authentication.** The restored auth/login/profile paths have no diff against the parent baseline. Sign Up remains on the login form; Google login, forgot password, password visibility, session behavior and baseline six-character profile validation remain. Firebase configuration was not changed. Regression tests passed; live Google/Firebase interaction remains human QA.

5. **Exact image files.** Added frontend `src/app/services/image-preflight.service.ts`, its `.spec.ts`, and `src/app/components/image-quality-checklist/image-quality-checklist.ts`. Modified `detail-my-class-student-pages.{ts,html,spec.ts}` and its `upload-essay-form/upload-essay-form.{ts,html,spec.ts}`, under `src/app/pages/students/my-class-student-pages/detail-my-class-student-pages/`. Added backend `src/services/imagePreflight.service.js`, `src/middlewares/imagePreflight.middleware.js`, `tests/fixtures/imagePreflightPage.js`, `tests/imagePreflight.test.js`, and `tests/imagePreflight.routes.test.js`. Modified backend `src/routes/submission.routes.js` and `tests/identicalReupload.release.test.js`. This report is also new.

6. **Implemented checks.** Resolution and extreme whole-image exposure are required. Actual decoded pixel dimensions and grayscale pixel counts determine their results. A required check that cannot run blocks submission with a technical retry state. Every green status represents one of those measurements.

7. **Unsupported checks.** Orientation requires recognizing reading direction; EXIF/dimensions alone cannot prove it. Blur lacks representative phone-image calibration for a reliable rejection threshold. Full content requires page/content detection. Visible writing requires dependable text detection. No suitable existing lightweight detector or representative real-photo fixture set was found. These four criteria are advisory/unavailable; no new classifier/provider was introduced. Tests assert unavailable for sideways/upside-down/blurred controls rather than pretending these cases fail automatically. This is the explicit unsupported-check exception in the request, not completion of its automatic IMG-2 orientation expectation.

8. **Configuration and calibration.** Centralized in backend `IMAGE_PREFLIGHT`: shorter edge >=480 and longer edge >=640 pixels; one grayscale working copy bounded to 1024 pixels on either edge, without enlargement; reject when >=99% of pixels have luminance <20, or >=99.99% have luminance >=254. The resolution floor is a conservative product choice below [Google Vision's 1024×768 OCR recommendation](https://docs.cloud.google.com/vision/docs/supported-files), not a provider requirement or OCR guarantee. Exposure intentionally catches only nearly black/white images, allowing imperfect lighting. Fixtures generate page-like pen strokes and variants for clear, low light, bright-but-visible, blur, rotations, EXIF and low resolution; they are synthetic document controls, not real phone-photo calibration. Real handwritten-photo validation remains required before release.

9. **Placement.** File selection -> temporary authenticated `/api/submissions/image-preflight` upload -> shared evaluator -> checklist -> explicit submission. Assignment and QR submission routes rerun that same evaluator before storage accounting/controller persistence. Temporary disk bytes are necessary to inspect the file and are cleaned up. PDFs and the separate ad-hoc OCR endpoint retain their previous behavior. The uploaded source is never rewritten: EXIF normalization affects only the disposable analysis copy, and edge ordering makes the resolution threshold orientation-independent.

10. **Credits.** The preflight endpoint does not access billing, assessment, OCR or database models. Rejected final uploads return before the submission controller. A database-backed regression checks unchanged File, Submission, AssessmentRun and CreditTransaction counts and no OCR/evaluation calls after rejection.

11. **Grading.** Both assignment-ID and QR submission routes block failed required checks server-side, so bypassing Angular does not start grading for a rejected image. Successful files continue into the existing pipeline. No paid OCR/AI was used to decide preflight readiness.

12. **Multiple images.** Every image has an independent result; the client evaluates sequentially. One pending/failed/unavailable-required result blocks the whole batch. Removing that page can restore readiness. Server evaluates all images and rejects/cleans the complete temporary batch if any image fails. PDFs keep existing handling.

13. **Races and cancellation.** Entry identity plus active-task identity guard results; removing/resetting/destroying unsubscribes requests and releases blob URLs. A late result cannot update a replacement. Retry cannot duplicate an active check. Parent upload state disables batch mutation, and its existing loading guard prevents duplicate submission. HTTP preflight has a 30-second timeout. Server preflight uses the existing rate limiter and a two-request per-user concurrency guard.

14. **Accessibility.** Each row has text/state and an icon, not color alone. Overall status uses polite atomic live announcements. Native buttons remain keyboard accessible. A full-image preview link allows the manual checks at useful scale. Unsupported criteria stay neutral and explicitly say Check yourself.

15. **Responsive checks.** Local headless Chrome exercised failed-image -> removal -> passing replacement at 360, 768 and 1280 pixels. Document scroll widths exactly matched those widths; failed images disabled submission, valid replacements enabled it; two passes and four manual checks appeared. No submission request was sent merely by checking. Screenshots and results are in workspace `output/image-preflight-qa/`. The existing scrollable checklist area keeps actions visible. Browser QA used mocked application APIs and real evaluator results from generated fixture bytes, not a live student account. Mobile and desktop screenshots were visually inspected.

16. **Backend tests.** New evaluator/route suites: 26/26 passed, command exit 0, including the final concurrency-guard route version. Broader auth/security/submission/reupload regressions: 67/67 assertions passed across 11 suites. That combined command exited 1 because the existing invalid-PDF feedback test logged asynchronous OCR/dispatch errors after suite completion. Isolated HEAD comparison of the feedback suite passed 6/6 but also emitted the same background errors; the exit failure itself was not reproduced in isolation. No unrelated PDF behavior was modified.

17. **Frontend tests.** Auth/login/profile group: 46/46 passed, exit 0. Student detail/upload/submission plus new preflight service group: 67/67 passed, exit 0. Includes stale results, retry, reset/destruction, pending/failed submit guard, per-page blocking, upload mutation lock, HTTP cancellation and malformed response. An earlier combined run had 109 passes and one guard failure from unexpected stored-session state. That guard and test are unchanged. An isolated HEAD combined run passed 132/132 (including old password-feature tests), so this intermittent combined-run failure is not claimed as conclusively reproduced on HEAD. Current split runs passed.

18. **Totals.** Final scoped runs: frontend 113 passed/0 failed/0 skipped; backend 93 assertions passed/0 failed/0 skipped. Backend broader command has the nonzero runner outcome described above; do not interpret assertion totals as a wholly green combined command. Browser QA: three widths passed. Unsupported image criteria and live-provider/manual scenarios are documented limitations, not hidden skipped test assertions.

19. **Build and checks.** Angular development build passed. App and spec TypeScript no-emit checks passed. Changed/new backend JavaScript syntax checks passed. Both repositories' `git diff --check` passed (only normal LF/CRLF conversion warnings). Full tracked diff and added implementation files reviewed; auth restored paths also compared against pre-feature parent.

20. **Pricing:** untouched.

21. **Teacher AI comments:** untouched.

22. **Scoring, rubrics and OCR interpretation:** untouched. Final submission guard changes admission only; it neither scores writing nor changes image bytes.

23. **Git diff --stat.** Tracked frontend diff: 22 files changed, 325 insertions, 589 deletions. Tracked backend diff: 2 files changed, 24 insertions, 1 deletion. Git's default diff excludes untracked additions: three frontend implementation/test files, this report, and five backend implementation/test files are additionally present and must be included in review. No staging was performed.

24. **Remaining human QA.** Exercise real upright, sideways, upside-down, tilted, low-light, extremely dark, blurred, bright/glare and cropped handwritten phone photos, including EXIF-tagged JPEGs. Confirm manual-only rows stay honest; sideways/blurred/cropped images can currently proceed when required basic checks pass. Test keyboard/screen-reader use, zoomed full-image preview, scrolling the complete checklist, rapid replacement and navigation, retry offline, mobile camera selection, multi-page reordering, PDF-only/mixed batches, and actual authenticated assignment/QR flows. In a test account, confirm rejected image leaves credits unchanged and a valid image completes existing assessment; verify baseline login/signup/Google/password-reset/profile changes. Confirm teacher comments remain unchanged. Real-photo calibration and live provider end-to-end verification were not performed.
