'use strict';
// Real-browser smoke test of the student and guest flows against the real backend code (in-process, in-memory database), after the student
// responses lost their teacher ids, creator ids and pipeline internals. For every flow: no console errors, no failed calls, correct rendering,
// and no teacher email or id anywhere on the page or in any response the page received. Synthetic data only.
//   node scripts/qa-student-flows.cjs [outputDir]     (needs the backend next to this repo, and npm run build:prod)
const fs = require('fs');
const path = require('path');
const BACKEND = path.resolve(__dirname, '../../backend');
const FRONT_PORT = 4402;
Object.assign(process.env, { JWT_SECRET: 'student-flows-qa', NODE_ENV: 'test', GUEST_SUBMISSION_ENABLED: 'true', FRONTEND_URL: `http://localhost:${FRONT_PORT}`,
  UPLOAD_BASE_PATH: `uploads/student-flows-qa-${process.pid}`, SENSITIVE_RATE_LIMIT_MAX: '100000', AUTH_READ_RATE_LIMIT_MAX: '100000', AUTH_WRITE_RATE_LIMIT_MAX: '100000',
  BASELINE_RATE_LIMIT_MAX: '1000000', SSE_TOKEN_RATE_LIMIT_MAX: '100000', COARSE_IP_RATE_LIMIT_MAX: '1000000', ENABLE_TEST_PDF_HTTP: 'true' });
process.env.PDF_FEEDBACK_CACHE_DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'student-flows-pdf-'));
const need = name => require(path.join(BACKEND, name));
const express = need('node_modules/express'), puppeteer = need('node_modules/puppeteer');
const quiet = need('src/utils/logger');
for (const level of ['debug', 'info', 'warn', 'metric']) if (typeof quiet[level] === 'function') quiet[level] = () => {};
const app = need('src/app');
const { connectInMemoryMongo, disconnectInMemoryMongo } = need('tests/helpers/testServer');
const { seedTestPlans } = need('tests/helpers/seedTestPlans');
const { signTestJwt } = need('tests/helpers/auth');
const { seedAnnotationFixture } = need('tests/helpers/annotationFixture');
const { seedStudentResources, RESOURCE_IDS, SHARE_TOKEN } = need('tests/helpers/studentResources');
const access = need('src/services/guestAccess.service');
const Submission = need('src/models/Submission'), File = need('src/models/File'), User = need('src/models/user.model'), Class = need('src/models/class.model'),
  Membership = need('src/models/membership.model'), Notification = need('src/services/notification.service'), Worksheet = need('src/models/Worksheet');

const out = path.resolve(process.argv[2] || path.join(__dirname, '../../output/student-flows-qa'));
const uploadRoot = path.resolve(BACKEND, process.env.UPLOAD_BASE_PATH);
const build = path.resolve(__dirname, '../dist/rozna-comarker-fe/browser');
const report = { steps: [], failures: [], consoleErrors: {}, failedCalls: {}, notes: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function check(name, ok, detail) { report.steps.push({ name, ok: Boolean(ok), ...(detail !== undefined ? { detail } : {}) }); if (!ok) report.failures.push(name); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== undefined ? ` :: ${JSON.stringify(detail).slice(0, 360)}` : ''}`); }
// Known and unrelated: the fixture user has no subscription record (GET /api/subscription/me answers 500, pre-existing), and the blocked fonts/analytics.
const KNOWN_CALL = /GET \/api\/subscription\/me 500/;
const KNOWN_CONSOLE = /ERR_FAILED|net::|Failed to load resource|fonts\.|googleapis|gstatic|getMySubscription/i;

(async () => {
  fs.mkdirSync(out, { recursive: true });
  await connectInMemoryMongo(); await seedTestPlans();
  await require(path.join(BACKEND, 'src/models/AnnotationAudit')).init();
  const fixture = await seedAnnotationFixture({ uploadRoot });
  const resources = await seedStudentResources(fixture);
  const teacherId = String(fixture.teacher._id), teacherEmail = 'teacher@example.com';
  await User.updateOne({ _id: fixture.teacher._id }, { $set: { displayName: 'Ms Rahman' } });
  for (const [fileId, submissionId, stored] of [[fixture.IDS.fileRegistered, fixture.IDS.registered, '00000000-0000-4000-8000-0000000000f1.png'], [fixture.IDS.fileGuest, fixture.IDS.guest, '00000000-0000-4000-8000-0000000000f2.png']]) {
    fs.renameSync(path.join(uploadRoot, 'submissions', `${fileId}.png`), path.join(uploadRoot, 'submissions', stored));
    await File.updateOne({ _id: fileId }, { $set: { filename: stored, path: `${process.env.UPLOAD_BASE_PATH}/submissions/${stored}`, url: `/uploads/submissions/${stored}` } });
    await Submission.updateOne({ _id: submissionId }, { $set: { fileUrl: `/uploads/submissions/${stored}`, fileUrls: [`/uploads/submissions/${stored}`] } });
  }
  // A second class to join (by link and by code), and a notification from the teacher.
  const joinable = await Class.create({ name: 'Join me', teacher: fixture.teacher._id, joinCode: 'JOINRC1' });
  await Notification.createNotification({ recipientId: fixture.student._id, actorId: fixture.teacher._id, type: 'assignment_uploaded', title: 'New assignment', description: 'A new task is ready.' });

  const frontend = express();
  frontend.use(express.static(build));
  frontend.get(/.*/, (_req, res) => res.sendFile(path.join(build, 'index.html')));
  const listen = (server, port) => new Promise((resolve, reject) => { const l = server.listen(port, () => resolve(l)); l.on('error', reject); });
  const apiServer = await listen(app, 0), site = await listen(frontend, FRONT_PORT);
  const apiPort = apiServer.address().port;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const base = `http://localhost:${FRONT_PORT}`;
  const studentJwt = signTestJwt({ id: fixture.student._id, role: 'student', firebaseUid: fixture.student.firebaseUid });
  const apiBase = `http://127.0.0.1:${apiPort}`;
  const A = fixture.IDS.assignment, C = fixture.IDS.class;

  async function open(label, jwt, url, ready) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1366, height: 1000 });
    if (jwt) await page.evaluateOnNewDocument(token => { localStorage.setItem('backend_jwt', token); }, jwt);
    report.consoleErrors[label] = []; report.failedCalls[label] = [];
    const seen = { bodies: [], urls: [], downloads: [] };
    page.on('console', msg => { if (msg.type() === 'error') report.consoleErrors[label].push(msg.text().replace(/[a-f0-9]{24}/g, '<id>').slice(0, 220)); });
    page.on('pageerror', error => report.consoleErrors[label].push(`pageerror: ${String(error.message).slice(0, 220)}`));
    await page.setRequestInterception(true);
    page.on('request', req => {
      const target = new URL(req.url());
      if (target.pathname.startsWith('/api/') || target.pathname.startsWith('/uploads/')) return req.continue({ url: `${apiBase}${target.pathname}${target.search}` });
      if (['127.0.0.1', 'localhost'].includes(target.hostname) || ['data:', 'blob:'].includes(target.protocol)) return req.continue();
      if (req.resourceType() === 'stylesheet') return req.respond({ status: 200, contentType: 'text/css', body: '' });
      return req.abort();
    });
    page.on('response', async res => {
      const target = new URL(res.url());
      if (!target.pathname.startsWith('/api/')) return;
      const key = `${res.request().method()} ${target.pathname.replace(/[a-f0-9]{24}/g, ':id')}`;
      seen.urls.push(`${key} ${res.status()}`);
      if (res.status() >= 400) report.failedCalls[label].push(`${key} ${res.status()}`);
      if ((res.headers()['content-type'] || '').includes('pdf')) seen.downloads.push({ key, status: res.status() });
      else if (res.status() === 200) { const text = await res.text().catch(() => ''); if (text) seen.bodies.push([key, text]); }
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (ready) await page.waitForFunction(ready, { timeout: 45000 }).catch(() => report.notes.push(`${label}: ready condition not met`));
    await sleep(2500);
    return { page, context, seen };
  }
  const text = page => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  const showTranscript = async page => { await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Transcribed Text/i.test(b.textContent))?.click()); await sleep(3500); };
  const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  /** The same checks for every flow: errors, failed calls, and nothing of the teacher's identity on the page or in any response. */
  async function finish(label, session, extra = {}) {
    const body = await text(session.page);
    await shot(session.page, label);
    const calls = report.failedCalls[label].filter(call => !KNOWN_CALL.test(call));
    const errors = report.consoleErrors[label].filter(error => !KNOWN_CONSOLE.test(error));
    check(`${label}: no console errors`, errors.length === 0, errors);
    check(`${label}: no failed calls`, calls.length === 0, calls);
    const leaks = session.seen.bodies.filter(([, b]) => b.includes(teacherEmail) || b.includes(teacherId)).map(([k]) => k);
    check(`${label}: no teacher email or id in the page or any response`, !body.includes(teacherEmail) && !body.includes(teacherId) && leaks.length === 0, { leaks: [...new Set(leaks)] });
    await session.context.close();
    return body;
  }
  const api = async (page, method, url, body) => page.evaluate(async (m, u, b, token) => {
    const res = await fetch(u, { method: m, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, ...(b ? { body: JSON.stringify(b) } : {}) });
    const textBody = await res.text(); let json = null; try { json = JSON.parse(textBody); } catch { /* not json */ }
    return { status: res.status, json, type: res.headers.get('content-type') };
  }, method, url, body, studentJwt);

  try {
    // 1. Dashboard, classes, class detail with its assignments
    let s = await open('01-dashboard', studentJwt, `${base}/student/dashboard`, () => document.body.innerText.length > 200);
    let body = await finish('01-dashboard', s);
    check('01-dashboard: the class and the teacher by name', body.includes('Writing 7B') && body.includes('Ms Rahman'), body.slice(0, 300));

    s = await open('02-my-classes', studentJwt, `${base}/student/my-classes`, () => /Writing 7B/.test(document.body.innerText));
    body = await finish('02-my-classes', s);
    check('02-my-classes: the class card shows the teacher by name', body.includes('Ms Rahman'), body.slice(0, 300));

    s = await open('03-class-detail', studentJwt, `${base}/student/my-classes/detail/${C}`, () => /Weekend essay/.test(document.body.innerText));
    body = await finish('03-class-detail', s);
    check('03-class-detail: assignments listed, teacher by name', /Weekend essay/.test(body) && body.includes('Ms Rahman'), body.slice(0, 400));

    // 2. Join a class: by link, then by code through the page's own dialog
    s = await open('04-join-by-link', studentJwt, `${base}/student/join-class?code=JOINRC1`, () => true);
    await sleep(3000);
    check('04-join-by-link: the page asks for a Firebase sign-in, which a test token cannot give (NOT exercised end to end)', s.page.url().includes('/login'), s.page.url());
    report.notes.push('UNPROVEN in a browser: the join page and the QR redirect need a real Firebase sign-in. Their API calls are checked below.');
    const joined = await api(s.page, 'POST', '/api/memberships/join', { joinCode: 'JOINRC1' });
    check('04-join (code): the join call answers 200 with the class, its name, and the teacher by name only', joined.status === 200 && joined.json?.data?.class?.name === 'Join me' && joined.json?.data?.class?.teacherDisplayName === 'Ms Rahman' && !JSON.stringify(joined.json).includes(teacherEmail), { status: joined.status, body: JSON.stringify(joined.json).slice(0, 200) });
    check('04-join (code): the student is in the class afterwards', Boolean(await Membership.exists({ student: fixture.student._id, class: joinable._id, status: 'active' })));
    body = await finish('04-join-by-link', s);

    // 3. QR links: worksheet, flashcards, essay
    // The redirect page asks the API what the QR code points at, then navigates. Without a Firebase sign-in it goes to the login page (NOT exercised);
    // so the call it makes is checked here, with the fields it reads.
    s = await open('05-qr-api', studentJwt, `${base}/student/dashboard`, () => document.body.innerText.length > 100);
    for (const [name, qr, type, resource] of [['worksheet', 'fixture-worksheet-qr', 'worksheet', String(RESOURCE_IDS.worksheet)], ['flashcards', 'fixture-flashcard-qr', 'flashcard', String(RESOURCE_IDS.flashcards)], ['essay', 'fixture-qr', 'essay', null]]) {
      const res = await api(s.page, 'GET', `/api/assignments/qr/${qr}`);
      const d = res.json?.data;
      check(`05-qr (${name}): the redirect's call answers with the resource, the class, and the teacher by name`, res.status === 200 && d?.resourceType === type && (!resource || String(d.resourceId) === resource) && Boolean(d?.class?._id) && d?.teacherDisplayName === 'Ms Rahman' && !('teacher' in d), { status: res.status, keys: Object.keys(d || {}) });
    }
    await finish('05-qr-api', s);
    // An essay assignment that allows guests opens the guest submission page, signed in or not.
    s = await open('07-qr-essay', studentJwt, `${base}/student/assignments/qr/fixture-qr`, () => /Weekend essay/.test(document.body.innerText));
    body = await finish('07-qr-essay', s);
    check('07-qr-essay: opens the submission page of the assignment', /Weekend essay/.test(body), body.slice(0, 200));

    // 4. Result and feedback page
    s = await open('08-result', studentJwt, `${base}/student/my-classes/detail/my-submissions/${A}?classId=${C}`, () => /Grammar\s*5/.test(document.body.innerText));
    await showTranscript(s.page);
    body = await finish('08-result', s);
    check('08-result: scores, corrections and feedback render', /Grammar\s*5/.test(body) && /AGR/.test(body) && /Mechanics/.test(body), body.slice(0, 300));
    check('08-result: By line is the teacher name, not an email', /By:\s*Ms Rahman/.test(body), body.match(/By:[^•]{0,40}/)?.[0]);

    // 5. Adaptive practice: the generate request (a ready session is reused), a checked answer, the attempts list
    s = await open('09-practice', studentJwt, `${base}/student/my-classes/detail/my-submissions/${A}?classId=${C}`, () => /Grammar\s*5/.test(document.body.innerText));
    const generated = await api(s.page, 'POST', `/api/adaptive-practice/submissions/${fixture.IDS.registered}/generate`, {});
    check('09-practice: generate answers with the ready session', generated.status === 200 && generated.json?.data?.state === 'ready', { status: generated.status, state: generated.json?.data?.state });
    const sessionData = generated.json?.data?.session;
    check('09-practice: the session has its activities and no provider, model or fingerprint', Boolean(sessionData?.activities?.length) && !/fixture-provider|fixture-model|promptVersion|sourceFingerprint/.test(JSON.stringify(generated.json)), Object.keys(sessionData || {}));
    const checkedAnswer = await api(s.page, 'POST', `/api/adaptive-practice/sessions/${resources.session._id}/activities/activity-1/check`, { questionId: 'q1', response: 'A' });
    check('09-practice: a checked answer (POST) answers, ready', [200, 202].includes(checkedAnswer.status) && ['ready', 'checking'].includes(checkedAnswer.json?.data?.state), { status: checkedAnswer.status, body: JSON.stringify(checkedAnswer.json).slice(0, 200) });
    check('09-practice: the attempt carries no checker provider, model or fingerprint', !/fixture-provider|fixture-model|responseFingerprint/.test(JSON.stringify(checkedAnswer.json)), JSON.stringify(checkedAnswer.json).slice(0, 160));
    const attempts = await api(s.page, 'GET', `/api/adaptive-practice/sessions/${resources.session._id}/attempts?activityId=activity-1&questionId=q1`);
    check('09-practice: the attempts list answers without internals', attempts.status === 200 && !/fixture-provider|fixture-model|responseFingerprint/.test(JSON.stringify(attempts.json)), { status: attempts.status });
    await finish('09-practice', s);

    // 6. Worksheet: the viewer pages, grading, submission, results page
    for (const [name, route] of [['10-worksheet-page', `/student/worksheet/${RESOURCE_IDS.worksheet}?assignmentId=${RESOURCE_IDS.worksheetAssignment}&classId=${C}`], ['11-worksheet-viewer', `/student/worksheet-viewer/${RESOURCE_IDS.worksheet}?assignmentId=${RESOURCE_IDS.worksheetAssignment}&classId=${C}`]]) {
      s = await open(name, studentJwt, `${base}${route}`, () => /Fixture worksheet|Choose/.test(document.body.innerText));
      body = await finish(name, s);
      check(`${name}: the worksheet renders, with no source text of the teacher's`, /Fixture worksheet|Choose/.test(body) && !body.includes('TEACHER-SOURCE-CONTENT') && !body.includes('MODEL-ANSWER-KEY'), body.slice(0, 300));
    }
    s = await open('12-worksheet-grade', studentJwt, `${base}/student/worksheet/${RESOURCE_IDS.worksheet}?assignmentId=${RESOURCE_IDS.worksheetAssignment}&classId=${C}`, () => true);
    const graded = await api(s.page, 'POST', `/api/worksheets/${RESOURCE_IDS.worksheet}/grade`, { assignmentId: String(RESOURCE_IDS.worksheetAssignment), answers: [] });
    report.notes.push(`worksheet grade (empty answers): ${graded.status} ${JSON.stringify(graded.json).slice(0, 120)}`);
    check('12-worksheet-grade: the grade request answers (200 or a clear 4xx), not a server error', graded.status < 500, graded.json);
    await finish('12-worksheet-grade', s);
    s = await open('13-worksheet-results', studentJwt, `${base}/student/worksheet-results`, () => document.body.innerText.length > 100);
    await finish('13-worksheet-results', s);

    // 7. Flashcards: a private set assigned to the class, then the public share link with no sign-in
    s = await open('14-flashcard-player', studentJwt, `${base}/student/flashcard-player/${RESOURCE_IDS.flashcards}?assignmentId=${RESOURCE_IDS.flashcardAssignment}&classId=${C}`, () => /cat|Study Complete/.test(document.body.innerText));
    body = await finish('14-flashcard-player', s);
    check('14-flashcard-player: the private assigned set opens (its result, as the fixture already has a submission)', /cat|Study Complete/.test(body) && !/ownerId|shareToken/.test(body), body.slice(0, 300));
    s = await open('15-shared-flashcards', null, `${base}/shared/flashcards/${SHARE_TOKEN}`, () => /cat|Fixture cards/.test(document.body.innerText));
    body = await finish('15-shared-flashcards', s);
    check('15-shared-flashcards: the public link renders with no sign-in', /cat|Fixture cards/.test(body), body.slice(0, 300));

    // 8. Notifications
    s = await open('16-notifications', studentJwt, `${base}/student/my-notification`, () => /New assignment/.test(document.body.innerText));
    body = await finish('16-notifications', s);
    check('16-notifications: the notification shows, sent by the teacher\'s name only', /New assignment/.test(body), body.slice(0, 300));

    // 9. PDF download: the button on the result page, and the file it asks for
    s = await open('17-pdf', studentJwt, `${base}/student/my-classes/detail/my-submissions/${A}?classId=${C}`, () => /Grammar\s*5/.test(document.body.innerText));
    const clicked = await s.page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Download Feedback PDF/i.test(x.textContent)); if (b) { b.click(); return true; } return false; });
    await sleep(15000);
    check('17-pdf: the Download button is on the page and asks for the PDF', clicked && s.seen.downloads.some(d => d.status === 200), { clicked, downloads: s.seen.downloads, calls: s.seen.urls.filter(u => /pdf/i.test(u)) });
    await finish('17-pdf', s);

    // 10. Resubmit: the upload (multipart) is accepted; the AI is not reachable here, so what follows is the honest failure state, not a result
    s = await open('18-resubmit', studentJwt, `${base}/student/my-classes/detail/${C}?assignmentId=${A}&resubmit=true`, () => true);
    const realPng = fs.readFileSync(path.join(uploadRoot, 'submissions', '00000000-0000-4000-8000-0000000000f1.png')).toString('base64');
    const upload = await s.page.evaluate(async (token, assignmentId, b64) => {
      const png = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const form = new FormData(); form.append('files', new Blob([png], { type: 'image/png' }), 'essay.png');
      const res = await fetch(`/api/submissions/${assignmentId}`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
      return { status: res.status, body: (await res.text()).slice(0, 200) };
    }, studentJwt, String(A), realPng);
    report.notes.push(`resubmit upload: ${upload.status} ${upload.body.replace(/[a-f0-9]{24}/g, '<id>')}`);
    const honest = upload.status < 500 || /IMAGE_PREFLIGHT_UNAVAILABLE/.test(upload.body);
    check('18-resubmit: the upload is accepted, or refused with a reason (here: the image check needs the AI provider, which this rehearsal blocks)', honest, upload);
    report.notes.push('UNPROVEN in this rehearsal: a successful submission and resubmission (the OCR and assessment need the real AI provider, which is blocked here). The upload endpoint, validation and the honest failure state were exercised.');
    report.failedCalls['18-resubmit'] = report.failedCalls['18-resubmit'].filter(call => !/POST \/api\/submissions\/:id (422|503)/.test(call));
    await finish('18-resubmit', s);

    // 11. Guest: own link result page, practice, PDF
    const link = new URL(access.returnUrl(String(fixture.IDS.guest), fixture.guestToken));
    s = await open('19-guest-result', null, `${base}${link.pathname}${link.hash}`, () => /Grammar\s*5/.test(document.body.innerText));
    await showTranscript(s.page);
    body = await finish('19-guest-result', s);
    check('19-guest-result: the guest result page renders', /Grammar\s*5/.test(body) && /AGR/.test(body), body.slice(0, 300));
    const guestGet = async (urlPath) => { const res = await fetch(`${apiBase}${urlPath}`, { headers: { 'X-Guest-Token': fixture.guestToken } }); return { status: res.status, type: res.headers.get('content-type'), text: res.headers.get('content-type')?.includes('json') ? await res.text() : '' }; };
    const guestPractice = await guestGet(`/api/guest/submissions/${fixture.IDS.guest}/practice`);
    check('19-guest-practice: answers, with no provider or model', guestPractice.status === 200 && !/fixture-provider|fixture-model|promptVersion|sourceFingerprint/.test(guestPractice.text), guestPractice.status);
    const guestPdf = await guestGet(`/api/guest/submissions/${fixture.IDS.guest}/pdf`);
    check('19-guest-pdf: the PDF downloads', guestPdf.status === 200 && /pdf/.test(guestPdf.type || ''), guestPdf);
  } catch (error) {
    check(`script aborted: ${error.message}`, false);
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`\n${report.steps.length - report.failures.length}/${report.steps.length} passed`);
    console.log('Notes:', JSON.stringify(report.notes, null, 1));
    const consoleOut = Object.fromEntries(Object.entries(report.consoleErrors).filter(([, v]) => v.length)), callsOut = Object.fromEntries(Object.entries(report.failedCalls).filter(([, v]) => v.length));
    console.log('Console errors (all, before filtering):', JSON.stringify(consoleOut, null, 1));
    console.log('Failed calls (all, before filtering):', JSON.stringify(callsOut, null, 1));
    await browser.close(); apiServer.close(); site.close(); await disconnectInMemoryMongo();
    fs.rmSync(uploadRoot, { recursive: true, force: true });
    fs.rmSync(process.env.PDF_FEEDBACK_CACHE_DIR, { recursive: true, force: true });
    process.exit(report.failures.length ? 1 : 0);
  }
})();
