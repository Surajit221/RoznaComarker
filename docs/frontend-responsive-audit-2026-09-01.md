# Frontend responsive implementation audit

Date: 2026-09-01

## Scope and counts

- 59 explicit responsive expressions (`device.isDesktop/isMobile/isTablet`, `window.innerWidth`, `matchMedia`, or `screen.width`) in 29 production files.
- 1 additional responsive interaction-shell decision through `device.isCompact()` in `CorrectionOverlay`.
- 60 responsive decision points in total across 30 production files.
- 26 `DeviceService` consumers. `HandwrittenOcrPage` injects it but does not use it.
- 138 ordinary CSS `@media` rules in 65 files. These are generally the desired single-tree responsive mechanism and are not counted as duplicated branches.
- One separate user-agent mobile decision in `file-download.util.ts`; it is platform download compatibility, not responsive layout.

## Classification legend

- A: presentation-only duplication
- B: interaction-shell difference
- C: legitimate device-specific behavior
- D: dangerous business-logic duplication
- E: dead or obsolete device branch

## Audit table

| Feature/page | File(s) | Desktop branch | Mobile/tablet branch | Business logic duplicated? | State duplicated? | API calls duplicated? | Event handlers duplicated? | Safe to unify? | Class / risk | Recommended action |
|---|---|---|---|---|---|---|---|---|---|---|
| Student submission/results | `pages/students/.../my-submission-page/my-submission-page.html/.ts` | Full ~380-line result tree | Full ~450-line tabbed result tree | No separate TS path found | No | No evaluation call from layout | Yes, same handlers in both trees | Not as one batch | A / High | Extract stable panels incrementally; retain current shells until visual and interaction parity is specified. |
| Teacher submission/review | `pages/teachers/.../student-submission-pages/student-submission-pages.html/.ts` | Full review/evaluation tree | Full tabbed review/evaluation tree | **Previously yes on image selection:** full submission pipeline was reused | Feedback and form state were reset by image click | Feedback/rubric/settings/review requests repeated; evaluation endpoint was not directly called | Yes | Viewer path only | D / Critical | Fixed image selection to refresh only media/page corrections; decompose the two large trees only in separately tested panel batches. |
| Correction image overlay | `components/correction-overlay/*` | Hover/pinned tooltip | Modal-like correction sheet | No | Shared | No | Shared | Keep shells | B/C / High | Retain responsive interaction shell; state and actions are already shared. |
| Tokenized transcript tooltip | `components/submission-details/tokenized-transcript/tokenized-transcript.ts` | Viewport-positioned overlay | Viewport-positioned overlay | No | Shared | No | Shared | No need | C / Low | Keep width measurement for collision/positioning. |
| Student upload form | `pages/students/.../upload-essay-form/upload-essay-form.html` | Desktop labels and height | Compact labels and height | No | Shared | No | Mostly shared | Yes | A / Medium | Replace label branches with responsive text/CSS after upload visual regression coverage exists. |
| Student class detail / submit-new-draft | `pages/students/.../detail-my-class-student-pages.html/.ts` | Dialog shell | Bottom-sheet shell | Submit handler is shared | Shared domain state; separate shell flags | Shared | Shell open/close duplicated | Partly | B / High | Keep shell choice; consolidate open state only after resubmission and body-scroll tests. |
| Teacher class detail / assignment QR | `pages/teachers/.../detail-my-classes-pages.html/.ts` | Dialog and desktop page tree | Bottom sheet and mobile page tree | Shared | Separate shell flags | Shared | Repeated markup | Partly | B / Medium | Keep QR shell choice; progressively unify assignment cards and common content. |
| Assignment form | `pages/teachers/.../assignment-form/assignment-form.html` | Desktop action placement | Mobile action placement | No | Shared form | Shared | Same action | Yes | A / Low | Use one action row with responsive CSS. |
| Teacher view-submissions dialog | `pages/teachers/.../dialog-view-submissions/dialog-view-submissions.html` | Desktop table/actions | Compact list/actions | No | Shared | Shared | Some duplicated | Yes | A/B / Medium | Preserve one dialog component; unify row content with responsive table/card CSS. |
| Teacher assignment QR dialog | `pages/teachers/.../dialog-qr-classes/dialog-qr-classes.html` | Desktop sizing/content | Compact sizing/content | No | Shared | No | No | Yes | A / Low | One responsive QR panel. |
| Invite students | `components/teacher/invite-students-dialog/invite-students-dialog.html` | Dialog layout | Compact layout | No | Shared | Shared invite action | Yes | Yes, incrementally | A/B / Medium | Unify shared form and result content; retain only shell styling if needed. |
| Student join class | `pages/students/my-class-student-pages/join-class-form/*` and parent `.ts` | Dialog | Bottom sheet | Join handler shared | Separate shell flags in parent | Shared | Shared submit, duplicated shell | Partly | B / Medium | Keep shell selector; ensure one validation/join handler (currently shared). |
| Dashboard layout/navigation | `layouts/dashboard-layout/*` | Persistent sidebar/header | Mobile header/drawer | Menu presentation differs | Shell state differs intentionally | No domain API split | Navigation markup duplicated | No | C / Medium | Retain device-specific shell; prevent menu/domain logic divergence. |
| Teacher dashboard | `pages/teachers/dashboard-teacher-pages/*` | Desktop dashboard tree | Mobile dashboard tree | Component logic shared | Shared | Shared | Repeated actions | Yes, in sections | A / Medium | Unify metric cards and activity sections independently. |
| Student dashboard | `pages/students/dashboard-student-pages/*` | Desktop dashboard tree | Mobile dashboard tree | Component logic shared | Shared | Shared | Repeated actions | Yes, in sections | A / Medium | Unify cards/sections independently. |
| Teacher classes list | `pages/teachers/my-classes-pages/my-classes-pages.*` | Desktop list/filter/actions | Mobile list/filter/actions | Shared | Shared | Shared | Repeated | Yes | A / Medium | One responsive list toolbar and card grid. |
| Student classes list | `pages/students/my-class-student-pages/my-class-student-pages.*` | Desktop list/join dialog | Mobile list/join sheet | Shared except shell selection | Separate shell flags | Shared | Repeated | Partly | A/B / Medium | Unify list; retain responsive join shell. |
| Teacher class card | `components/teacher/my-classes-card/*` | Full horizontal card | Compact/tablet cards | No | Shared inputs | No | Yes | Yes | A / Low | One card with responsive grid/flex layout. |
| Student class card | `components/student/my-classes-card-student/*` | Full horizontal card | Compact/tablet cards | No | Shared inputs | No | Yes | Yes | A / Low | One card with responsive grid/flex layout. |
| Teacher class form | `pages/teachers/my-classes-pages/my-classes-form/*` | Desktop form tree | Compact form tree | Submit logic shared | Shared form | Shared | Yes | Yes | A / Medium | One responsive form; verify validation focus and error placement. |
| Teacher profile | `pages/teachers/my-profile-pages/*` | Desktop profile tree | Mobile/tablet tree | Shared | Shared form/profile | Shared | Yes | Yes, in sections | A / Medium | Unify profile sections progressively. |
| Student profile | `pages/students/my-profile-student-pages/*` | Desktop profile tree | Mobile/tablet tree | Shared | Shared form/profile | Shared | Yes | Yes, in sections | A / Medium | Unify profile sections progressively. |
| Teacher notifications | `pages/teachers/my-notification-pages/*` | Desktop notification tree | Compact notification tree | Shared | Shared | Shared | Yes | Yes | A / Low | One responsive notification list. |
| Student notifications | `pages/students/my-notification-student-pages/*` | Desktop notification tree | Compact notification tree | Shared | Shared | Shared | Yes | Yes | A / Low | One responsive notification list. |
| Teacher student profile | `pages/teachers/.../student-profile-pages/*` | Desktop details/actions | Compact details/actions | Shared | Shared | Shared | Yes | Yes | A / Medium | One responsive profile/details tree. |
| Login | `pages/auth/login-pages/*` | Desktop branded/auth tree | Compact auth tree | Authentication methods shared | Shared | Shared auth API | Repeated form handlers | Yes but sensitive | A / High | Extract a single login form first; preserve branding panels and auth behavior. |
| Handwritten OCR | `pages/students/handwritten-ocr-page/handwritten-ocr-page.ts` | None | None | No | No | No | No | Yes | E / Low | Remove unused `DeviceService` injection in a later cleanup-only change. |
| Device service | `services/device.service.ts` | `desktop` signal | `mobile`/`tablet` signals | No domain logic | Responsive state only | No | N/A | Keep | C / Low | Keep for genuine interaction shells; reduce template feature-tree control over time. |
| Worksheet flows and reports | `pages/worksheets/**`, `components/worksheet*/**`, student worksheet pages | No DeviceService feature-tree split found | Responsive CSS in the same trees | No | Shared | Shared | Shared | Already aligned | C / Low | Retain CSS responsiveness; no structural refactor justified by this audit. |
| Flashcards | `pages/flashcards/**`, `components/teacher/flashcard*/**` | No DeviceService feature-tree split found | Responsive CSS in the same trees | No | Shared | Shared | Shared | Already aligned | C / Low | Retain current single-tree responsive implementation. |
| Teacher reports | `pages/teachers/report-pages/**`, `components/comprehensive-report/**` | No DeviceService feature-tree split found | Responsive CSS in the same trees | No | Shared | Shared | Shared | Already aligned | C / Low | Retain current single-tree responsive implementation. |
| Admin pages | `pages/admin/**`, `layouts/admin-layout/**` | Shared admin shell | Shared responsive admin shell | No | Shared | Shared | Shared | Already aligned | C / Low | Retain the shared responsive admin layout. |

## Critical request-flow findings

1. Student image selection already uses one explicit action and does not call an evaluation/re-evaluation endpoint. It reloads authenticated media and page-specific OCR/correction presentation while retaining feedback and Adaptive Writing state.
2. Teacher image selection used `applyCurrentSubmission(currentSubmission, false)`. That method clears feedback/canonical/form state and repeats submission-level reads and the reviewed marker. This was a dangerous coupling even though no evaluation endpoint was directly invoked by the click.
3. Teacher image selection now uses a viewer-only path. It updates `activeFileIndex`, authenticated media, OCR/correction presentation, and nothing in the feedback/evaluation pipeline.
4. Breakpoint signals are not referenced by evaluation, feedback, or Adaptive Learning request methods. The two large submission templates remount their presentation trees across breakpoints, but the parent component/domain state persists.
5. No frontend mirror or rotation state/action was found in submission components or `CorrectionOverlay`. Therefore a reported mirrored source is not produced or corrected by these responsive branches; changing upload format or inventing a transform would be unsafe without a reproducible requirement.

## Stop condition

Collapsing either complete submission template in one change is not safe without approved presentation parity. The desktop and compact trees differ in tab model, control placement, correction legend interaction, status actions, and feedback layout. The business state is shared, but choosing one tree as canonical would silently remove behavior from the other. Continue by extracting and validating one panel at a time (viewer, transcript, feedback, Adaptive Writing) with screenshot/browser coverage.
