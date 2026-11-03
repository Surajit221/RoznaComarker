'use strict';
// Real-browser QA of the Grade check panel (Task 7D), against the real backend code in-process with an in-memory database, and of the student
// pages it must not change. Synthetic text only.
//   node scripts/qa-grade-check.cjs [outputDir]     (needs the backend next to this repo, and npm run build:prod)
const fs = require('fs');
const path = require('path');
const BACKEND = path.resolve(__dirname, '../../backend');
const FRONT_PORT = 4401;
Object.assign(process.env, { JWT_SECRET: 'grade-check-qa', NODE_ENV: 'test', GUEST_SUBMISSION_ENABLED: 'true', FRONTEND_URL: `http://localhost:${FRONT_PORT}`,
  UPLOAD_BASE_PATH: `uploads/grade-check-qa-${process.pid}`, SENSITIVE_RATE_LIMIT_MAX: '100000', AUTH_READ_RATE_LIMIT_MAX: '100000', AUTH_WRITE_RATE_LIMIT_MAX: '100000',
  ANNOTATION_RATE_LIMIT_MAX: '100000', ENABLE_TEST_PDF_HTTP: 'true' });
process.env.PDF_FEEDBACK_CACHE_DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'grade-check-qa-pdf-'));
const need = name => require(path.join(BACKEND, name));
const express = need('node_modules/express'), puppeteer = need('node_modules/puppeteer');
const quiet = need('src/utils/logger');
for (const level of ['debug', 'info', 'warn', 'metric']) if (typeof quiet[level] === 'function') quiet[level] = () => {};
const app = need('src/app');
const { connectInMemoryMongo, disconnectInMemoryMongo } = need('tests/helpers/testServer');
const { seedTestPlans } = need('tests/helpers/seedTestPlans');
const { signTestJwt } = need('tests/helpers/auth');
const { seedAnnotationFixture } = need('tests/helpers/annotationFixture');
const { annotationApi, manualValue } = need('tests/helpers/annotationApi');
const access = need('src/services/guestAccess.service');
const Submission = need('src/models/Submission'), SubmissionFeedback = need('src/models/SubmissionFeedback'), File = need('src/models/File'),
  User = need('src/models/user.model'), Class = need('src/models/class.model'), AnnotationAudit = need('src/models/AnnotationAudit');

const out = path.resolve(process.argv[2] || path.join(__dirname, '../../output/grade-check-qa'));
const uploadRoot = path.resolve(BACKEND, process.env.UPLOAD_BASE_PATH);
const build = path.resolve(__dirname, '../dist/rozna-comarker-fe/browser');
const report = { steps: [], failures: [], consoleErrors: {}, failedCalls: {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function check(name, ok, detail) { report.steps.push({ name, ok: Boolean(ok), ...(detail !== undefined ? { detail } : {}) }); if (!ok) report.failures.push(name); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== undefined ? ` :: ${JSON.stringify(detail).slice(0, 400)}` : ''}`); }

(async () => {
  fs.mkdirSync(out, { recursive: true });
  await connectInMemoryMongo(); await seedTestPlans();
  await AnnotationAudit.init();
  const fixture = await seedAnnotationFixture({ uploadRoot });
  const teacherId = String(fixture.teacher._id), teacherEmail = 'teacher@example.com';
  await User.updateOne({ _id: fixture.teacher._id }, { $set: { displayName: 'Ms Rahman' } });
  for (const [fileId, submissionId, stored] of [[fixture.IDS.fileRegistered, fixture.IDS.registered, '00000000-0000-4000-8000-0000000000f1.png'], [fixture.IDS.fileGuest, fixture.IDS.guest, '00000000-0000-4000-8000-0000000000f2.png']]) {
    fs.renameSync(path.join(uploadRoot, 'submissions', `${fileId}.png`), path.join(uploadRoot, 'submissions', stored));
    await File.updateOne({ _id: fileId }, { $set: { filename: stored, path: `${process.env.UPLOAD_BASE_PATH}/submissions/${stored}`, url: `/uploads/submissions/${stored}` } });
    await Submission.updateOne({ _id: submissionId }, { $set: { fileUrl: `/uploads/submissions/${stored}`, fileUrls: [`/uploads/submissions/${stored}`] } });
  }
  // Rubric rows as a real evaluation stores them.
  const rubricScores = { CONTENT: { score: 15, maxScore: 20, comment: 'Ideas are relevant.', issueCount: 0 }, ORGANIZATION: { score: 15, maxScore: 20, comment: 'Clear order.', issueCount: 0 },
    GRAMMAR: { score: 18, maxScore: 25, comment: '3 grammar issues detected. Accuracy is generally controlled, but the recorded patterns should be revised.', issueCount: 3 },
    VOCABULARY: { score: 15, maxScore: 20, comment: 'Word choice is adequate.', issueCount: 0 },
    MECHANICS: { score: 8, maxScore: 10, comment: '2 mechanics issues detected. Accuracy is generally controlled, but the recorded patterns should be revised.', issueCount: 2 },
    PRESENTATION: { score: 4.5, maxScore: 5, comment: 'Readable.', issueCount: 0 } };
  await SubmissionFeedback.collection.updateMany({}, { $set: { rubricScores, overallScore: 75.5, grade: 'C' } });

  const api = annotationApi(app, fixture.teacher);
  const frontend = express();
  frontend.use(express.static(build));
  frontend.get(/.*/, (_req, res) => res.sendFile(path.join(build, 'index.html')));
  const listen = (server, port) => new Promise((resolve, reject) => { const l = server.listen(port, () => resolve(l)); l.on('error', reject); });
  const apiServer = await listen(app, 0), site = await listen(frontend, FRONT_PORT);
  const apiPort = apiServer.address().port;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const base = `http://localhost:${FRONT_PORT}`;
  const teacherJwt = signTestJwt({ id: fixture.teacher._id, role: 'teacher', firebaseUid: fixture.teacher.firebaseUid });
  const studentJwt = signTestJwt({ id: fixture.student._id, role: 'student', firebaseUid: fixture.student.firebaseUid });
  const id = fixture.IDS.registered, feedbackBytes = async () => JSON.stringify(await SubmissionFeedback.collection.find({}).sort({ _id: 1 }).toArray());
  const teacherUrl = mode => `${base}/teacher/my-classes/detail/student-submissions/${mode === 'guest' ? 'guest' : fixture.student._id}?classId=${fixture.IDS.class}&assignmentId=${fixture.IDS.assignment}&submissionId=${fixture.IDS[mode]}`;
  const studentUrl = mode => { if (mode === 'guest') { const link = new URL(access.returnUrl(String(fixture.IDS.guest), fixture.guestToken)); return `${base}${link.pathname}${link.hash}`; } return `${base}/student/my-classes/detail/my-submissions/${fixture.IDS.assignment}?classId=${fixture.IDS.class}`; };

  const control = { loseResponse: null };
  async function open(label, jwt, url, ready, { width = 1366, height = 1000 } = {}) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width, height });
    if (jwt) await page.evaluateOnNewDocument(token => { localStorage.setItem('backend_jwt', token); }, jwt);
    report.consoleErrors[label] = []; report.failedCalls[label] = [];
    const seen = { keepBodies: [], studentBodies: [] };
    page.on('console', msg => { if (msg.type() === 'error') report.consoleErrors[label].push(msg.text().replace(/[a-f0-9]{24}/g, '<id>').slice(0, 200)); });
    page.on('pageerror', error => report.consoleErrors[label].push(`pageerror: ${String(error.message).slice(0, 200)}`));
    await page.setRequestInterception(true);
    page.on('request', async req => {
      const target = new URL(req.url());
      const local = `http://127.0.0.1:${apiPort}${target.pathname}${target.search}`;
      if (target.pathname.endsWith('/score-review') && req.method() === 'POST') {
        seen.keepBodies.push(JSON.parse(req.postData()));
        // The request reaches the server and is applied, but the answer never reaches the page.
        if (control.loseResponse) {
          control.loseResponse = null;
          await fetch(local, { method: 'POST', headers: { 'content-type': 'application/json', authorization: req.headers().authorization }, body: req.postData() });
          return req.abort('failed');
        }
      }
      if (target.pathname.startsWith('/api/') || target.pathname.startsWith('/uploads/')) return req.continue({ url: local });
      if (['127.0.0.1', 'localhost'].includes(target.hostname) || ['data:', 'blob:'].includes(target.protocol)) return req.continue();
      if (req.resourceType() === 'stylesheet') return req.respond({ status: 200, contentType: 'text/css', body: '' });
      return req.abort();
    });
    page.on('response', async res => {
      const target = new URL(res.url());
      if (!target.pathname.startsWith('/api/') && !target.pathname.startsWith('/uploads/')) return;
      if (res.status() >= 400) report.failedCalls[label].push(`${res.request().method()} ${target.pathname.replace(/[a-f0-9]{24}/g, ':id')} ${res.status()}`);
      if (res.status() === 200 && target.pathname.startsWith('/api/') && res.request().method() === 'GET') { const text = await res.text().catch(() => ''); if (text) seen.studentBodies.push([target.pathname.replace(/[a-f0-9]{24}/g, ':id'), text]); }
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector(ready, { timeout: 60000 });
    return { page, context, seen };
  }
  const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`) });

  async function openTeacher(label, options) {
    const t = await open(label, teacherJwt, teacherUrl('registered'), 'app-annotation-controls', options);
    await t.page.waitForSelector('[aria-controls="annotation-editor-body"]', { timeout: 60000 });
    await sleep(1500);
    await t.page.click('[aria-controls="annotation-editor-body"]');
    await t.page.waitForSelector('[data-grade-check]', { timeout: 30000 });
    return t;
  }
  const panelText = page => page.$eval('[data-grade-check]', el => el.textContent.replace(/\s+/g, ' ').trim());
  const label = page => page.$eval('[data-grade-label]', el => el.textContent.trim());
  const waitLabel = (page, want) => page.waitForFunction(text => document.querySelector('[data-grade-label]')?.textContent.trim() === text, { timeout: 20000 }, want);
  const reloadLatest = async page => { await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Reload latest/.test(b.textContent)).click()); await sleep(900); };
  const hideInUi = async (page, quoted) => {
    await page.evaluate(q => { const row = [...document.querySelectorAll('[data-row-key]')].find(r => r.textContent.includes(`"${q}"`) || r.textContent.includes(`“${q}”`) || r.textContent.includes(q));
      [...row.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('Hide')).click(); }, quoted);
    await sleep(900);
  };
  const typeReason = async (page, value) => { await page.click('[data-grade-reason]', { clickCount: 3 }); await page.type('[data-grade-reason]', value); await sleep(150); };

  /** The student page as text: both views, plus the statistics and the By line. */
  async function readStudent(page, scope) {
    await page.waitForFunction(sel => /Grammar\s*18/.test(document.querySelector(sel)?.textContent || ''), { timeout: 60000 }, scope);
    await sleep(1500);
    const pick = () => page.evaluate(sel => { const root = document.querySelector(sel).cloneNode(true);
      root.querySelectorAll('app-adaptive-writing-studio, app-draft-comparison').forEach(el => el.remove());
      root.querySelectorAll('button').forEach(b => { if (/Download Feedback PDF|Back To|Generating/.test(b.textContent)) b.remove(); });
      return root.textContent.replace(/\s+/g, ' ').trim(); }, scope);
    const uploaded = await pick();
    await page.evaluate(sel => [...document.querySelector(sel).querySelectorAll('button')].find(b => /Transcribed Text/.test(b.textContent))?.click(), scope);
    await page.waitForSelector(`${scope} app-tokenized-transcript .correction-highlight`, { timeout: 60000 });
    await sleep(800);
    return { uploaded, transcript: await pick(), by: await page.$eval(`${scope} .result-author-date`, el => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null) };
  }
  const studentNow = async (mode, name) => {
    const s = await open(`student-${name}`, mode === 'guest' ? null : studentJwt, studentUrl(mode), 'app-my-submission-page');
    const read = await readStudent(s.page, 'app-my-submission-page');
    read.bodies = s.seen.studentBodies;
    read.card = await s.page.evaluate(() => { const card = document.querySelector('app-canonical-detailed-feedback .feedback-card[data-category="VOCABULARY"]');
      return { present: Boolean(card), text: card?.textContent.replace(/\s+/g, ' ').trim() ?? '', badge: Boolean(card?.querySelector('.score-badge')), otherBadges: document.querySelectorAll('app-canonical-detailed-feedback .score-badge').length }; });
    await shot(s.page, `student-${name}`);
    await s.context.close();
    return read;
  };
  const previewNow = async name => {
    const t = await open(`teacher-preview-${name}`, teacherJwt, teacherUrl('registered'), 'app-student-submission-pages');
    await t.page.waitForSelector('[data-preview-open]', { timeout: 60000 });
    await sleep(2000);
    await t.page.click('[data-preview-open]');
    await t.page.waitForSelector('dialog[open] app-my-submission-page', { timeout: 30000 });
    const read = await readStudent(t.page, 'dialog[open] app-my-submission-page');
    await shot(t.page, `preview-${name}`);
    await t.context.close();
    return read;
  };
  const pdfNow = async mode => {
    const res = mode === 'guest' ? await fetch(`http://127.0.0.1:${apiPort}/api/guest/submissions/${fixture.IDS.guest}/pdf`, { headers: { 'X-Guest-Token': fixture.guestToken } })
      : await fetch(`http://127.0.0.1:${apiPort}/api/pdf/download/${id}`, { headers: { authorization: `Bearer ${studentJwt}` } });
    if (res.status !== 200) return `status ${res.status}`;
    return (await need('node_modules/pdf-parse')(Buffer.from(await res.arrayBuffer()))).text.replace(/\s+/g, ' ');
  };
  const scrub = text => text.replace(/Generated[^.]*\d{4}[^.]*?(?=\s[A-Z])/g, '').replace(/\d{1,2}:\d{2}(:\d{2})?\s?(AM|PM)?/g, '<time>');

  try {
    const feedbackAtStart = await feedbackBytes();

    // 1. hide -> needed -> Keep -> checked
    const a = await openTeacher('teacher-main');
    check('starts: no check needed, words not only colour', (await label(a.page)) === 'No check needed.', await label(a.page));
    check('the misleading policy sentence is gone', !(await a.page.$eval('app-annotation-controls', el => el.textContent)).includes('existing teacher grading controls'));
    check('scores shown: overall, grade, categories', /Overall: 75\.5 · Grade: C/.test(await panelText(a.page)) && (await panelText(a.page)).includes('Grammar 18/25'), await panelText(a.page));
    check('no button when nothing is needed', !(await a.page.$('[data-grade-keep]')));
    await shot(a.page, '01-not-needed');
    await hideInUi(a.page, 'a');
    await waitLabel(a.page, 'Check needed.');
    let text = await panelText(a.page);
    check('hide -> needed, with the plain explanation', text.includes('Corrections changed after these scores were set. Check the grade.'), text);
    check('counts: when scored vs shown', text.includes('Grammar: 3 when scored, 2 shown to the student'), text);
    check('the notes are shown', text.includes('Scores are not changed here. This records that you checked them.') && text.includes("Scores can't be edited in this screen yet."), text);
    await shot(a.page, '02-needed');

    const before = { student: await studentNow('registered', 'registered-before'), preview: await previewNow('before'), pdf: await pdfNow('registered') };
    const feedbackBeforeKeep = await feedbackBytes();
    await typeReason(a.page, 'Kept <b>after</b> checking');
    await a.page.focus('[data-grade-keep]');
    await a.page.keyboard.press('Enter');
    await waitLabel(a.page, 'Checked.');
    await sleep(600);
    text = await panelText(a.page);
    check('Keep (keyboard) -> checked, with time and who', /Checked on .* by you\./.test(text), text);
    check('the reason shows as plain text', (await a.page.$eval('[data-grade-decision-reason]', el => el.textContent)) === 'Kept <b>after</b> checking' && !(await a.page.$('[data-grade-decision-reason] b')));
    check('the result is announced in a live region', (await a.page.$eval('app-grade-check [role="status"]', el => el.textContent)).includes('Checked.'));
    check('focus moved to the status, as the button is gone', await a.page.evaluate(() => document.activeElement?.hasAttribute('data-grade-status')));
    check('Keep changed nothing: feedback documents byte-identical, updatedAt included', (await feedbackBytes()) === feedbackBeforeKeep);
    // Since the start only the page-open review marker may differ (PATCH /reviewed, existing behaviour): no score, and nothing Keep wrote.
    const changedKeys = (from, to) => JSON.parse(from).flatMap((doc, i) => Object.keys({ ...doc, ...JSON.parse(to)[i] }).filter(key => JSON.stringify(doc[key]) !== JSON.stringify(JSON.parse(to)[i][key])));
    const moved = [...new Set(changedKeys(feedbackAtStart, await feedbackBytes()))].sort();
    check('since the start only the page-open review marker changed', moved.every(key => ['teacherReviewedAt', 'teacherReviewedBy', 'updatedAt'].includes(key)), moved);
    await shot(a.page, '03-checked');

    await a.page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Change history/.test(b.textContent)).click());
    await a.page.waitForSelector('[data-history-reason]', { timeout: 15000 });
    const history = await a.page.$eval('.history', el => el.textContent.replace(/\s+/g, ' '));
    check('history: a readable row with the reason', history.includes('Grade checked') && history.includes('Scores kept. No score was changed.') && history.includes('Reason: Kept <b>after</b> checking'), history.slice(0, 300));
    await shot(a.page, '04-history');
    await a.page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Change history/.test(b.textContent)).click());

    // Student page, preview and PDF are unchanged by Keep.
    const after = { student: await studentNow('registered', 'registered-after'), preview: await previewNow('after'), pdf: await pdfNow('registered') };
    check('student page text unchanged after Keep (both views)', before.student.uploaded === after.student.uploaded && before.student.transcript === after.student.transcript);
    check('preview text unchanged after Keep', before.preview.uploaded === after.preview.uploaded && before.preview.transcript === after.preview.transcript);
    check('PDF text unchanged after Keep', scrub(before.pdf) === scrub(after.pdf), { before: before.pdf.length, after: after.pdf.length });
    check('no review data in the student page, preview or PDF', ![after.student.transcript, after.preview.transcript, after.pdf].some(t => /Grade check|Kept <b>|Keep these scores/.test(t)));
    check('no review data in any student response', !after.student.bodies.some(([, body]) => /scoreReview|scoringReview|score_review|Kept <b>/.test(body)));

    // 2. second hide -> needed again
    await hideInUi(a.page, 'dont');
    await waitLabel(a.page, 'Check needed.');
    check('second hide -> needed again; the earlier check stays on show', /Last checked on/.test(await panelText(a.page)), await panelText(a.page));
    await a.page.click('[data-grade-keep]');
    await waitLabel(a.page, 'Checked.');

    // 3. scores changed under the panel
    await SubmissionFeedback.collection.updateOne({ submissionId: id }, { $set: { overallScore: 70, 'rubricScores.GRAMMAR.score': 12.5 } });
    await reloadLatest(a.page);
    await waitLabel(a.page, 'Check needed.');
    text = await panelText(a.page);
    check('an evaluation update -> needed, and it says the scores changed', text.includes('These scores changed after your last check') && text.includes('Overall: 70'), text);
    await shot(a.page, '05-scores-changed');
    // ... and the same while the page still shows the old scores: refused, told, never resent.
    await SubmissionFeedback.collection.updateOne({ submissionId: id }, { $set: { overallScore: 71 } });
    const sentBefore = a.seen.keepBodies.length;
    await a.page.click('[data-grade-keep]');
    await a.page.waitForSelector('[data-grade-error]', { timeout: 15000 });
    await sleep(800);
    check('scores changed between load and Keep: told, nothing recorded', (await a.page.$eval('[data-grade-error]', el => el.textContent)).includes('the scores changed'));
    check('the new score is now on screen', (await panelText(a.page)).includes('Overall: 71'));
    check('never resent by itself', a.seen.keepBodies.length === sentBefore + 1);
    check('focus moved to the error', await a.page.evaluate(() => document.activeElement?.hasAttribute('data-grade-error')));

    // 4. assessment busy
    await Submission.collection.updateOne({ _id: id }, { $set: { evaluationStatus: 'processing' } });
    await reloadLatest(a.page);
    await waitLabel(a.page, 'Not available right now.');
    check('assessment busy -> unavailable, no button', !(await a.page.$('[data-grade-keep]')) && (await panelText(a.page)).includes('Try again when it finishes.'));
    await shot(a.page, '06-unavailable');
    await Submission.collection.updateOne({ _id: id }, { $set: { evaluationStatus: 'completed' } });
    await reloadLatest(a.page);
    await waitLabel(a.page, 'Check needed.');

    // 5. unsaved editor input blocks it
    await a.page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Add correction/.test(b.textContent)).click());
    await a.page.waitForSelector('#annotation-message');
    await a.page.type('#annotation-message', 'Unsaved note');
    await sleep(300);
    const sentGate = a.seen.keepBodies.length;
    await a.page.click('[data-grade-keep]');
    await sleep(300);
    check('unsaved editor input: blocked with the reason shown, nothing sent', a.seen.keepBodies.length === sentGate
      && (await a.page.$eval('[data-grade-keep]', el => el.getAttribute('aria-disabled'))) === 'true' && (await a.page.$eval('[data-grade-blocked]', el => el.textContent)).includes('Save or cancel your correction first'));
    await shot(a.page, '07-blocked-by-editor');
    await a.page.evaluate(() => [...document.querySelectorAll('.form button')].find(b => /Cancel/.test(b.textContent)).click());
    await sleep(300);

    // 6. two tabs: conflict, with the reason text kept
    const b = await openTeacher('teacher-second-tab');
    await waitLabel(b.page, 'Check needed.');
    await typeReason(a.page, 'Reason typed in the first tab');
    await hideInUi(b.page, 'realy');
    await b.context.close();
    await a.page.click('[data-grade-keep]');
    await a.page.waitForSelector('[data-grade-error]', { timeout: 15000 });
    await sleep(800);
    check('two tabs: a plain conflict message', (await a.page.$eval('[data-grade-error]', el => el.textContent)).includes('this submission changed since you opened it'));
    check('two tabs: the reason text is kept', (await a.page.$eval('[data-grade-reason]', el => el.value)) === 'Reason typed in the first tab');
    await shot(a.page, '08-two-tabs-conflict');

    // 7. tablet width, and the rebuild at the layout breakpoint
    await a.page.setViewport({ width: 820, height: 1180 });
    await a.page.waitForSelector('[aria-controls="annotation-editor-body"]', { timeout: 30000 });
    await a.page.waitForSelector('[data-grade-check]', { timeout: 30000 });
    await sleep(1200);
    check('rebuilt at the tablet breakpoint: the reason survives', (await a.page.$eval('[data-grade-reason]', el => el.value)) === 'Reason typed in the first tab');
    check('tablet width: the panel does not overflow', await a.page.$eval('[data-grade-check]', el => el.getBoundingClientRect().right <= window.innerWidth && el.scrollWidth <= el.clientWidth + 1));
    check('tablet width: the button is a usable touch target', (await a.page.$eval('[data-grade-keep]', el => el.getBoundingClientRect().height)) >= 44);
    await shot(a.page, '09-tablet');

    // 8. a typed reason asks before leaving
    let prompted = null;
    a.page.once('dialog', async dialog => { prompted = dialog.type(); await dialog.dismiss(); });
    await a.page.close({ runBeforeUnload: true });
    await sleep(800);
    check('a typed reason asks before the tab is closed', prompted === 'beforeunload', prompted);
    await a.context.close().catch(() => {});

    // 9. offline: the answer is lost, Retry with the same id applies once
    const o = await openTeacher('teacher-offline');
    await waitLabel(o.page, 'Check needed.');
    await typeReason(o.page, 'Sent while offline');
    const rowsBefore = await AnnotationAudit.countDocuments({ submissionId: id, action: 'score_review' });
    control.loseResponse = true;
    await o.page.click('[data-grade-keep]');
    await o.page.waitForSelector('[data-grade-retry]', { timeout: 15000 });
    check('offline: says it is safe to retry; the reason is kept and locked', (await o.page.$eval('[data-grade-error]', el => el.textContent)).includes('safe and cannot record twice')
      && (await o.page.$eval('[data-grade-reason]', el => el.value)) === 'Sent while offline' && (await o.page.$eval('[data-grade-reason]', el => el.readOnly)));
    await shot(o.page, '10-offline-retry');
    await sleep(1500);
    check('offline: nothing is resent by itself', o.seen.keepBodies.length === 1, o.seen.keepBodies.length);
    await o.page.click('[data-grade-retry]');
    await waitLabel(o.page, 'Checked.');
    check('retry uses the same request id', o.seen.keepBodies.length === 2 && o.seen.keepBodies[0].requestId === o.seen.keepBodies[1].requestId, o.seen.keepBodies.map(x => x.requestId));
    check('applied once: one audit row', (await AnnotationAudit.countDocuments({ submissionId: id, action: 'score_review' })) === rowsBefore + 1);
    await o.context.close();

    // 10. closed class
    const hideRow = (await api.snapshot(id)).body.data.corrections.find(c => c.quotedText === 'goes' && c.moderationStatus === 'visible');
    await api.act(id, { action: 'hide', id: hideRow.id });
    await Class.updateOne({ _id: fixture.IDS.class }, { $set: { status: 'archived' } });
    const c = await openTeacher('teacher-closed');
    await c.page.waitForSelector('[data-grade-readonly]', { timeout: 15000 });
    check('closed class: read-only, no field and no button; status still shown', !(await c.page.$('[data-grade-keep]')) && !(await c.page.$('[data-grade-reason]')) && (await label(c.page)) === 'Check needed.');
    await shot(c.page, '11-closed-class');
    await c.context.close();
    await Class.updateOne({ _id: fixture.IDS.class }, { $set: { status: 'active' } });
    const d = await openTeacher('teacher-closes-under-page');
    await waitLabel(d.page, 'Check needed.');
    await Class.updateOne({ _id: fixture.IDS.class }, { $set: { status: 'archived' } });
    await d.page.click('[data-grade-keep]');
    await d.page.waitForSelector('[data-grade-readonly]', { timeout: 15000 });
    check('class closed under the page: told, and the panel goes read-only', (await d.page.$eval('[data-grade-error]', el => el.textContent)).includes('This class is closed') && !(await d.page.$('[data-grade-keep]')));
    await d.context.close();
    await Class.updateOne({ _id: fixture.IDS.class }, { $set: { status: 'active' } });

    // 11. the 7G card, with no 0/0 badge, and the By line
    await SubmissionFeedback.collection.updateMany({}, { $set: { overallScore: 75.5, 'rubricScores.GRAMMAR.score': 18 } });
    for (const mode of ['registered', 'guest']) {
      const doc = mode === 'guest' ? fixture.guest : fixture.registered;
      const added = await api.act(fixture.IDS[mode], { action: 'add', value: manualValue(doc, 'park', { symbol: 'WC', category: 'VOCABULARY', message: 'Teacher note: be more specific.', suggestedText: 'the city park' }) });
      if (added.status !== 200) throw new Error(`add ${mode}: ${added.status} ${added.body.code}`);
      const page = await studentNow(mode, `${mode}-card`);
      check(`${mode}: the new card shows`, page.card.present && page.card.text.includes('1 issue') && page.card.text.includes('Teacher note: be more specific.'), page.card);
      check(`${mode}: the new card has no score badge and no 0/0`, !page.card.badge && !page.card.text.includes('0/0'), page.card);
      check(`${mode}: other cards keep their score badges`, page.card.otherBadges > 0, page.card.otherBadges);
      check(`${mode}: By line shows a name, no email`, page.by && !page.by.includes('@') && page.by.includes(mode === 'guest' ? 'Your teacher' : 'Ms Rahman'), page.by);
      check(`${mode}: no teacher email or id on the page`, !page.transcript.includes(teacherEmail) && !page.transcript.includes(teacherId));
      const leaks = page.bodies.filter(([, body]) => body.includes(teacherEmail) || body.includes(teacherId)).map(([url]) => url);
      check(`${mode}: no teacher email or id in any response the student page received`, leaks.length === 0, [...new Set(leaks)]);
      const pdf = await pdfNow(mode);
      check(`${mode}: the PDF shows the card, with no score for it`, pdf.includes('1 distinct issue affected this category') && !/Vocabulary - (undefined|NaN|0\/0)/.test(pdf), pdf.slice(0, 200));
      check(`${mode}: no teacher email in the PDF`, !pdf.includes(teacherEmail));
    }
    const preview = await previewNow('card');
    check('preview: By line shows the name', preview.by?.includes('Ms Rahman') && !preview.by.includes('@'), preview.by);

  } catch (error) {
    check(`script aborted: ${error.message}`, false);
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`\n${report.steps.length - report.failures.length}/${report.steps.length} passed`);
    console.log('Console errors:', JSON.stringify(report.consoleErrors, null, 1));
    console.log('Failed calls:', JSON.stringify(report.failedCalls, null, 1));
    await browser.close(); apiServer.close(); site.close(); await disconnectInMemoryMongo();
    fs.rmSync(uploadRoot, { recursive: true, force: true });
    fs.rmSync(process.env.PDF_FEEDBACK_CACHE_DIR, { recursive: true, force: true });
    process.exit(report.failures.length ? 1 : 0);
  }
})();
