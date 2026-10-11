VERDICT: HARD BLOCKED

Local password requirements UI is implemented and tested. Full production enforcement and the Firebase-hosted reset UI remain blocked. On 2026-10-11 the user explicitly selected: “Keep exact rules; report Firebase enforcement as blocked.” No live Firebase configuration was changed.

The existing authentication authority is Firebase. Signup uses `createUserWithEmailAndPassword`, password changes use `reauthenticateWithCredential` then `updatePassword`, and reset emails use `sendPasswordResetEmail` with Firebase's hosted action handler. Express only exchanges verified Firebase identity tokens for its JWT. Its User model has no password/hash field, and there are no active Express endpoints accepting new passwords. `/register` redirects to `/login`; signup was already on the shared login screen. No local reset completion, initial-password, or admin password-setup form exists.

A read-only call to the configured project's public `v2/passwordPolicy` endpoint returned:

```json
{
  "customStrengthOptions": { "minPasswordLength": 6, "maxPasswordLength": 4096 },
  "schemaVersion": 1,
  "enforcementState": "ENFORCE"
}
```

The old frontend login password validator was required-only; both profile security forms required a minimum of six characters for current, new and confirm passwords. No shared password policy or requirements component existed.

The new local policy requires eight characters, ASCII uppercase, ASCII lowercase, ASCII numeric digit, and any character outside `A-Za-z0-9`. It does not trim passwords or impose a special-character allowlist. The existing Firebase maximum of 4096 characters is preserved and displayed. Thus `Abcdef1!`, `Abcdef1-`, `Abcdef1+`, `Abcdef1=`, and a compliant password whose special character is whitespace or a non-ASCII character pass local validation.

Firebase's native policy uses a fixed special-character set, which is not equivalent to the requested rule. See [Identity Platform password policy documentation](https://docs.cloud.google.com/identity-platform/docs/password-policy). Adding Express validation alone would not prevent direct Firebase SDK/REST bypasses. Therefore no unused Express policy helper, password proxy, replacement reset-token flow, or misleading backend enforcement test was added. The local helper is the single UI policy source; Firebase remains the security authority and still enforces its existing policy. The frontend and provider policies do **not** yet match.

| Flow | Result |
| --- | --- |
| `/login`, normal login | Required-only password validation and existing Firebase login call unchanged. Checklist absent. Legacy weak password forwarding covered by a regression test. |
| `/login`, Sign Up | Sign Up opens explicit signup mode with the reusable live checklist. Create account requires valid email and compliant password. Back to login hides the checklist and preserves ordinary login validation. AuthService also rejects weak signup passwords when callers bypass the form. |
| `/register` | Existing redirect to `/login` preserved, including referral handling. |
| `/teacher/my-profile`, Security | Shared checklist and new-password validator; current password only requires a value; existing reauthentication, update call, form reset, and logout preserved. |
| `/student/my-profile`, Security | Same behavior as teacher security. |
| Forgot password | Existing neutral response, Firebase reset email, continue URL and error handling unchanged. |
| Firebase-hosted reset completion | Unchanged; exact new-password enforcement and custom checklist remain blocked. No local reset route was invented. |
| Express `/api/auth/login` | Unchanged Firebase-token-to-JWT exchange. No complexity validation added. |
| Express `/api/auth/request-password-reset` | Existing deprecated 410 response unchanged. |

Confirm-password fields remain on both profile forms and require exact equality. Mismatch messaging waits until the confirm field is touched. Invalid new passwords or mismatches disable submission and are also rejected by the existing submit handlers. Signup had no confirmation field, so none was removed. Ordinary local validation leaves typed values intact.

Password inputs default to masked text. Eye buttons remain native keyboard-accessible buttons with `type="button"`, dynamic Show password/Hide password labels and `aria-pressed`. Profile labels are associated with inputs, new-password inputs describe the corresponding checklist, and autocomplete distinguishes current from new passwords. Check icons plus semantic met/not-met text avoid color-only status. Overall status uses `role="status"`, `aria-live="polite"` and `aria-atomic="true"`. Empty checklists use neutral styling. Existing focus indicators remain.

Exact changed frontend files, relative to `RoznaComarker/`:

| File | Change |
| --- | --- |
| `src/app/auth/auth-error.util.ts` | Safe password-policy error copy. |
| `src/app/auth/auth.service.ts` | Shared local policy assertion before signup only. |
| `src/app/auth/password-policy.util.ts` | New reusable evaluator, form validator and assertion. |
| `src/app/auth/password-policy.util.spec.ts` | New policy/length/character tests. |
| `src/app/auth/auth-password.spec.ts` | New AuthService signup boundary and error-copy tests. |
| `src/app/auth/password-forms.spec.ts` | New shared regression tests for both profile forms. |
| `src/app/components/password-requirements/password-requirements.ts` | New reusable live checklist and scoped styles. |
| `src/app/components/password-requirements/password-requirements.spec.ts` | New checklist state and accessibility tests. |
| `src/app/pages/auth/login-pages/login-pages.ts` | Signup intent and validation, leaving login validation unchanged. |
| `src/app/pages/auth/login-pages/login-pages.html` | Signup-only checklist and accessible visibility controls in both layouts. |
| `src/app/pages/auth/login-pages/login-pages.spec.ts` | Signup, legacy login, input and visibility regressions. |
| `src/app/pages/teachers/my-profile-pages/my-profile-pages.ts` | New-password validator and policy error handling. |
| `src/app/pages/teachers/my-profile-pages/my-profile-pages.html` | Desktop/mobile checklist, labels, confirmation timing and button validation. |
| `src/app/pages/students/my-profile-student-pages/my-profile-student-pages.ts` | New-password validator and policy error handling. |
| `src/app/pages/students/my-profile-student-pages/my-profile-student-pages.html` | Desktop/mobile checklist, labels, confirmation timing and button validation. |
| `PASSWORD_POLICY_QA.md` | This audit and handoff. |

Backend files changed: none. Backend worktree was clean before and after testing. No dependency or lockfile changes.

Validation results:

| Check | Pass | Fail | Skip |
| --- | ---: | ---: | ---: |
| Backend authentication/authorization regressions, 7 suites | 42 | 0 | 0 |
| Frontend auth, guards/interceptors, profile and password suites | 85 | 0 | 0 |
| Total automated unit/integration tests | 127 | 0 | 0 |
| Browser signup QA at 360, 768 and 1280 pixels | 3 viewport runs | 0 | 0 |

The frontend total combines the initial 83-test run and a separate two-test AuthService boundary run. Tests cover empty state, each missing requirement, all specified incremental examples, deletion/reset, unrestricted special characters, maximum length, status text, confirm mismatch, matching valid forms, policy rejection without field clearing, both profile layout branches, signup-only requirements, weak legacy login forwarding, visibility buttons, policy error copy, existing signup verification handling, forgot password, role selection, verification, backend-token handling, interceptors and the existing admin guard.

Backend suites run: `security.phase4.auth.test.js`, `security.phase4.firebase.test.js`, `firebaseUserLifecycle.test.js`, `firebaseManagedAuthEmail.test.js`, `firebaseCredentialIsolation.test.js`, `authorization.phase1.test.js`, and `phase1.firebaseInit.test.js`.

Browser QA exercised all six states (empty plus cases A–E) at each viewport, checked the status and button state, activated the eye with Enter and Space, and verified no horizontal overflow, checklist overlap, or inaccessible submit button. Mobile and desktop screenshots were visually inspected. Local screenshots and machine-readable geometry results are in `../output/password-ui-qa/`; the reproducible browser script is `../tmp/password-ui-qa.cjs`. Screenshots use the existing font fallback because external font requests were blocked during isolated QA. Profile components were exercised in browser unit tests at the same three layout widths; authenticated full-page profile screenshots were not taken.

Case F (live legacy Firebase account login) and real provider password changes/reset links were not exercised: no real account credentials were used and no accounts were created or changed. The local regression confirms a weak legacy password reaches the existing login service unchanged. Provider bypass rejection, exact-policy hosted reset, and live legacy-current-password-to-strong-password updates remain unverified/blocked; they are not counted as passed or skipped executable tests.

| Build/static check | Result |
| --- | --- |
| TypeScript `tsconfig.app.json --noEmit` | Passed |
| TypeScript `tsconfig.spec.json --noEmit` | Passed, including the added service tests |
| Angular development build | Passed |
| Changed backend JS syntax | Not applicable: no backend JS changed |
| `git diff --check`, both repositories | Passed using the repositories' configured line-ending behavior |
| Manual diff/security audit | Completed |

No unrelated failing tests were found. Existing reactive-form disabled-attribute notices and dependency deprecation warnings were emitted without test failures. An extra diff experiment with `core.autocrlf=false` interpreted Windows CRLF as trailing whitespace; the normal repository-configured diff check passes. The initial sandboxed visual-browser launch timed out; its authorized external-sandbox rerun passed.

Reproduction commands (from the respective repository directories):

```text
# backend
npm.cmd test -- --runTestsByPath tests/security.phase4.auth.test.js tests/security.phase4.firebase.test.js tests/firebaseUserLifecycle.test.js tests/firebaseManagedAuthEmail.test.js tests/firebaseCredentialIsolation.test.js tests/authorization.phase1.test.js tests/phase1.firebaseInit.test.js

# RoznaComarker
npm.cmd test -- --watch=false --browsers=ChromeHeadlessCI --include="src/app/auth/**/*.spec.ts" --include="src/app/components/password-requirements/*.spec.ts" --include="src/app/pages/auth/**/*.spec.ts" --include="src/app/pages/teachers/my-profile-pages/*.spec.ts" --include="src/app/pages/students/my-profile-student-pages/*.spec.ts"
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.spec.json
node node_modules/@angular/cli/bin/ng.js build --configuration development
git diff --check
```

`git diff --stat` for tracked frontend changes:

```text
 src/app/auth/auth-error.util.ts                    |  3 +-
 src/app/auth/auth.service.ts                       |  2 +
 src/app/pages/auth/login-pages/login-pages.html    | 50 +++++++++++--------
 src/app/pages/auth/login-pages/login-pages.spec.ts | 58 +++++++++++++++++++++-
 src/app/pages/auth/login-pages/login-pages.ts      | 17 ++++++-
 .../my-profile-student-pages.html                  | 58 +++++++++++-----------
 .../my-profile-student-pages.ts                    | 15 ++++--
 .../my-profile-pages/my-profile-pages.html         | 58 +++++++++++-----------
 .../teachers/my-profile-pages/my-profile-pages.ts  | 15 ++++--
 9 files changed, 186 insertions(+), 90 deletions(-)
```

Git's unstaged diff stat excludes six new source/test files and this report; all seven remain untracked for review. Nothing was staged, committed, pushed or deployed.

Password hashing, Firebase policy/configuration, reset token generation/expiry/use, JWT/session/refresh behavior, remember-me semantics, roles, authorization and email verification are unchanged. No password logging, analytics, query parameters, persistent password storage, or plaintext password API responses were added. Passwords stay in the existing in-memory form state and normal SDK submission path. No unrelated OCR, grading, billing, credit, subscription, upload, class, institution or notification code changed.

To complete the original production security feature, resolve enforcement at the Firebase boundary while retaining the exact requested special-character semantics and legacy login compatibility. A frontend helper or an uncalled Express validator cannot establish that guarantee. This is the agreed remaining blocker, not a completed backend feature.
