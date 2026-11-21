'use strict';
// Real-browser QA of the speaking (audio) screens, against the real backend code in-process with an in-memory database (like the other qa-*.cjs).
// Every recording state is seeded with the backend's own test helpers; marking runs through the real assessment code against a FAKE model reply.
// No speech-to-text, AI, email or other network call is ever made (any non-local fetch throws). Synthetic people and recordings only.
// Screens, each at 1280, 1100, 390 and 320 px: the assignment type choice, the speaking form (and the writing form, to compare), the teacher class
// page with a speaking card, the student class page, the upload dialog (and the essay upload dialog, to compare), the student speaking page in
// every status, and the teacher speaking page with the result and the cap line. For each: a screenshot, console errors, failed calls and any
// horizontal overflow; plus computed-style comparisons of the speaking screens with the matching writing screens.
//   node scripts/qa-speaking-flows.cjs [outputDir]     (needs the backend next to this repo, and npm run build:prod)
const fs = require('fs');
const path = require('path');
const BACKEND = path.resolve(__dirname, '../../backend');
const FRONT_PORT = 4410;
Object.assign(process.env, { JWT_SECRET: 'speaking-flows-qa', NODE_ENV: 'test', AUDIO_STT_ENABLED: 'true', FRONTEND_URL: `http://localhost:${FRONT_PORT}`,
  UPLOAD_BASE_PATH: `uploads/speaking-flows-qa-${process.pid}`, SENSITIVE_RATE_LIMIT_MAX: '100000', AUTH_READ_RATE_LIMIT_MAX: '100000', AUTH_WRITE_RATE_LIMIT_MAX: '100000',
  BASELINE_RATE_LIMIT_MAX: '1000000', SSE_TOKEN_RATE_LIMIT_MAX: '100000', COARSE_IP_RATE_LIMIT_MAX: '1000000', SPEAKING_UPLOAD_RATE_LIMIT_MAX: '100000' });
// Tripwire: the process never reaches the network (the fake model reply is injected; speech-to-text is never started).
const localFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const host = new URL(String(url?.url || url)).hostname;
  if (!['127.0.0.1', 'localhost'].includes(host)) throw new Error(`REAL_NETWORK_CALL_BLOCKED ${host}`);
  return localFetch(url, init);
};
// The backend's fake model reply is written for Jest; this small stand-in is all it needs outside Jest.
globalThis.jest = { fn: impl => { const fn = (...args) => impl(...args); return fn; } };

const need = name => require(path.join(BACKEND, name));
const express = need('node_modules/express'), puppeteer = need('node_modules/puppeteer');
const quiet = need('src/utils/logger');
for (const level of ['debug', 'info', 'warn', 'metric', 'error']) if (typeof quiet[level] === 'function') quiet[level] = () => {};
const app = need('src/app');
const { connectInMemoryMongo, disconnectInMemoryMongo } = need('tests/helpers/testServer');
const { seedTestPlans } = need('tests/helpers/seedTestPlans');
const { seedSpeaking, makeAudioSubmission, person, rid } = need('tests/helpers/speakingFixtures');
const Membership = need('src/models/membership.model'), Submission = need('src/models/Submission');
const h = need('tests/helpers/speakingAssessmentFixtures');
const samples = need('tests/helpers/audioSamples');
const { TEXTS } = need('tests/fixtures/audio/speakingBenchmark.cjs');
const assessment = need('src/services/audio/speakingAssessment.service');
const User = need('src/models/user.model'), Assignment = need('src/models/assignment.model'), AudioRecording = need('src/models/AudioRecording');

const out = path.resolve(process.argv[2] || path.join(__dirname, '../../output/speaking-flows-qa'));
const build = path.resolve(__dirname, '../dist/rozna-comarker-fe/browser');
// 900: a tablet width (769 to 1024 px is the tablet layout), stage 9.
const VIEWPORTS = [{ name: '1280', width: 1280, height: 900 }, { name: '1100', width: 1100, height: 900 }, { name: '900', width: 900, height: 1100 },
  { name: '390', width: 390, height: 844 }, { name: '320', width: 320, height: 700 }];
const report = { screens: [], failures: [], styleComparisons: [], notes: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Known and unrelated (CLAUDE.md): the fixture users have no subscription or wallet record, and fonts and icons from CDNs are blocked here.
const KNOWN_CALL = /GET \/api\/(subscription\/me|credits\/wallet)[^ ]* 500/;
const KNOWN_CONSOLE = /ERR_FAILED|ERR_BLOCKED|net::|Failed to load resource|fonts\.|googleapis|gstatic|unpkg|boxicons|getMySubscription|wallet/i;
const TOWN = 'Speak for one to three minutes about the town where you live: what it is like, what people do there, and what you would change.';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const uploadRoot = path.resolve(BACKEND, process.env.UPLOAD_BASE_PATH);
  await connectInMemoryMongo(); await seedTestPlans(); await AudioRecording.createIndexes();

  // ---- Data: one class, a teacher and a student; one speaking assignment per state, plus the essay assignment ----
  const f = await seedSpeaking();
  await User.updateOne({ _id: f.teacher.user._id }, { $set: { displayName: 'Ms Rahman' } });
  await User.updateOne({ _id: f.student.user._id }, { $set: { displayName: 'Ana Lima' } });
  await Assignment.updateOne({ _id: f.assignment._id }, { $set: { instructions: TOWN, speaking: { maxRecordingSeconds: 180, rubricRef: null } } });
  await Assignment.updateOne({ _id: f.essay._id }, { $set: { instructions: 'Write about the river in your town.' } });
  await h.personalCredits(f.teacher.user, 50);
  const week = () => new Date(Date.now() + 7 * 86400000);
  const speakingAssignment = (title, extra = {}) => Assignment.create({ title, writingType: 'speaking', resourceType: 'speaking', class: f.klass._id,
    teacher: f.teacher.user._id, deadline: week(), qrToken: rid(), instructions: TOWN, speaking: { maxRecordingSeconds: 180, rubricRef: null }, ...extra });
  const forAssignment = assignment => ({ ...f, assignment });
  const assess = async (made, reply) => {
    await assessment.enqueueAssessment(made.recording._id);
    return assessment.runSpeakingAssessment(made.recording._id, { env: h.TEST_ENV, fetchImpl: h.fakeOpenRouter(reply) });
  };
  const BUILT = 'Last year the council builded a new library near the station. ';
  const READY_TEXT = `My town is next to a wide river and there are many old bridges. ${BUILT}People like it because it is quiet. ${BUILT}`
    + `It have a small market and the streets are busy with bicycles in the morning. ${BUILT}In the evening families sit outside and talk. ${BUILT}`
    + 'If I could change one thing, I would build a second bridge for buses and bicycles, because the main bridge is often blocked.';
  const readyReply = h.output({ level: 'Good', levels: { 'speaking-grammar': 'Developing', 'speaking-fluency': 'Excellent' },
    corrections: [1, 2, 3, 4].map(occurrence => ({ category: 'GRAMMAR', symbol: 'VF', quotedText: 'builded', occurrence, suggestedText: 'built', message: 'Built is the past form of build.' }))
      .concat([{ category: 'GRAMMAR', symbol: 'AGR', quotedText: 'It have', occurrence: 1, suggestedText: 'It has', message: 'Use has with it.' }]) });

  const A = {};
  A.none = f.assignment;
  A.transcribing = await speakingAssignment('Talk about your weekend');
  const transcribing = await makeAudioSubmission(forAssignment(A.transcribing), { status: 'queued', seconds: 64 });
  A.assessing = await speakingAssignment('Describe your school');
  const assessing = await h.readyRecording(forAssignment(A.assessing), TEXTS.MEDIUM, { seconds: 48 });
  await assessment.enqueueAssessment(assessing.recording._id);
  A.ready = await speakingAssignment('Describe a place you love');
  const ready = await h.readyRecording(forAssignment(A.ready), READY_TEXT, { seconds: 70 });
  await AudioRecording.updateOne({ _id: ready.recording._id }, { $set: { 'derived.displayText.fillers': [{ wordIndex: 0, offset: 0, text: 'Um,' }, { wordIndex: 14, offset: 67, text: 'uh' }] } });
  report.notes.push(`ready: ${(await assess(ready, readyReply)).status}`);
  A.hidden = await speakingAssignment('Describe your street (marks hidden)', { showMarksToStudent: false });
  const hidden = await h.readyRecording(forAssignment(A.hidden), TEXTS.STRONG, { seconds: 80 });
  report.notes.push(`hidden marks: ${(await assess(hidden, h.output({ level: 'Excellent' }))).status}`);
  A.offTopic = await speakingAssignment('Describe your town (off topic)');
  const offTopic = await h.readyRecording(forAssignment(A.offTopic), TEXTS.OFF_TOPIC, { seconds: 40 });
  report.notes.push(`off topic: ${(await assess(offTopic, h.output({ relevance: 'off_topic', level: 'Good', levels: { 'speaking-task': 'Beginning' } }))).status}`);
  A.short = await speakingAssignment('Introduce yourself');
  const short = await h.readyRecording(forAssignment(A.short), 'My town is small and quiet. I like it.', { seconds: 9 });
  report.notes.push(`too short: ${(await assess(short, h.output())).status}`);
  A.notEnglish = await speakingAssignment('Describe your family');
  const notEnglish = await h.readyRecording(forAssignment(A.notEnglish), TEXTS.SPANISH, { seconds: 24 });
  report.notes.push(`not English: ${(await assess(notEnglish, h.output({ assessable: false, reason: 'not_english' }))).status}`);
  A.failed = await speakingAssignment('Describe your favourite food');
  const failed = await makeAudioSubmission(forAssignment(A.failed), { status: 'failed', seconds: 30 });
  await AudioRecording.updateOne({ _id: failed.recording._id }, { $set: { lastErrorCode: 'AUDIO_STT_TIMEOUT', attempts: 3, failedAt: new Date() } });
  A.blocked = await speakingAssignment('Describe a festival');
  const blocked = await h.readyRecording(forAssignment(A.blocked), TEXTS.MEDIUM, { seconds: 50 });
  await h.personalCredits(f.teacher.user, 0);
  report.notes.push(`no credits: ${(await assess(blocked, h.output())).status}`);
  await h.personalCredits(f.teacher.user, 50);

  // Stage 9: recordings the teacher uploaded for students (transcribing, not marked, marked), as the teacher upload stores them.
  A.teacherUploads = await speakingAssignment('Teacher uploads');
  const member = async label => { const p = await person('student', label); await Membership.create({ student: p.user._id, class: f.klass._id, status: 'active' }); return p; };
  const [ben, cy] = [await member('Ben Okafor'), await member('Cy Tran')];
  const asTeacherUpload = async (made, typedName, emailStatus) => Submission.updateOne({ _id: made.submission._id }, { $set: { teacherUpload: {
    uploadedBy: f.teacher.user._id, batchId: 'batch-qa-0001', uploadedAt: new Date(), typedName, email: { status: emailStatus, attempts: 0 } } } });
  const tuTranscribing = await makeAudioSubmission({ ...forAssignment(A.teacherUploads), student: ben }, { status: 'transcribing', seconds: 40 });
  await asTeacherUpload(tuTranscribing, 'Ben Okafor', 'queued');
  const tuShort = await h.readyRecording({ ...forAssignment(A.teacherUploads), student: cy }, 'My town is small and quiet. I like it.', { seconds: 9 });
  await assess(tuShort, h.output());
  await asTeacherUpload(tuShort, 'Cy Tran', 'held');
  const tuMarked = await h.readyRecording(forAssignment(A.teacherUploads), TEXTS.STRONG, { seconds: 80 });
  report.notes.push(`teacher upload marked: ${(await assess(tuMarked, h.output({ level: 'Excellent' }))).status}`);
  await asTeacherUpload(tuMarked, 'Ana Lima', 'none');

  // ---- Servers and browser ----
  const frontend = express();
  frontend.use(express.static(build));
  frontend.get(/.*/, (_req, res) => res.sendFile(path.join(build, 'index.html')));
  const listen = (server, port) => new Promise((resolve, reject) => { const l = server.listen(port, () => resolve(l)); l.on('error', reject); });
  const apiServer = await listen(app, 0), site = await listen(frontend, FRONT_PORT);
  const apiBase = `http://127.0.0.1:${apiServer.address().port}`;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const base = `http://localhost:${FRONT_PORT}`;
  const C = String(f.klass._id);
  const wavFile = path.join(out, 'sample-recording.wav');
  fs.writeFileSync(wavFile, samples.wav(8));

  async function open(viewport, token, url) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: viewport.width, height: viewport.height });
    await page.evaluateOnNewDocument(jwt => { localStorage.setItem('backend_jwt', jwt); }, token);
    const seen = { console: [], calls: [] };
    page.on('console', msg => { if (msg.type() === 'error' && !KNOWN_CONSOLE.test(msg.text())) seen.console.push(msg.text().replace(/[a-f0-9]{24}/g, '<id>').slice(0, 220)); });
    page.on('pageerror', error => seen.console.push(`pageerror: ${String(error.message).slice(0, 220)}`));
    await page.setRequestInterception(true);
    page.on('request', req => {
      const target = new URL(req.url());
      if (target.pathname.startsWith('/api/') || target.pathname.startsWith('/uploads/')) return req.continue({ url: `${apiBase}${target.pathname}${target.search}` });
      if (['127.0.0.1', 'localhost'].includes(target.hostname) || ['data:', 'blob:'].includes(target.protocol)) return req.continue();
      if (req.resourceType() === 'stylesheet') return req.respond({ status: 200, contentType: 'text/css', body: '' });
      return req.abort();
    });
    page.on('response', res => {
      const target = new URL(res.url());
      const line = `${res.request().method()} ${target.pathname.replace(/[a-f0-9]{24}/g, ':id')} ${res.status()}`;
      if (target.pathname.startsWith('/api/') && res.status() >= 400 && !KNOWN_CALL.test(line)) seen.calls.push(line);
    });
    await page.goto(`${base}${url}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    return { page, context, seen };
  }
  const waitFor = async (fn, timeout = 30000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return true; await sleep(200); } return false; };
  const visible = (page, selector) => page.evaluate(s => [...document.querySelectorAll(s)].some(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed'), selector);
  const clickText = (page, selector, text) => page.evaluate((s, t) => {
    const el = [...document.querySelectorAll(s)].find(e => e.textContent.trim() === t && e.offsetParent !== null);
    if (!el) return false; el.click(); return true;
  }, selector, text);
  const overflow = page => page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const scroll = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const offenders = [];
    if (scroll > width + 1) {
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width && r.right > width + 1 && getComputedStyle(el).position !== 'fixed') {
          offenders.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className || '').toString().split(/\s+/).slice(0, 3).join('.')} (right ${Math.round(r.right)})`);
          if (offenders.length >= 5) break;
        }
      }
    }
    return { clientWidth: width, scrollWidth: scroll, overflowing: scroll > width + 1, offenders };
  });
  // Desktop says Create Assignment; the phone layout's button says + Assignment (unchanged from before speaking).
  const openCreate = async page => (await clickText(page, 'button', 'Create Assignment')) || clickText(page, 'button', '+ Assignment');
  const textOf = page => page.evaluate(() => document.body.innerText);

  // Each screen: where to go, how to know it is ready, an optional action, and checks on the page text.
  const teacher = f.teacher.token, student = f.student.token;
  const speakingPage = a => `/student/my-classes/detail/my-speaking/${a._id}?classId=${C}`;
  const noLeak = text => !/credit|capped at|before the cap|deepgram|openrouter|openai|gemini|INSUFFICIENT|AUDIO_STT/i.test(text);
  // Stage 9 helpers: open "Upload for a student" on the "Teacher uploads" card, add a member and a guest, then go to the recordings step.
  async function openTeacherUpload(page) {
    const opened = await page.evaluate(title => {
      const card = [...document.querySelectorAll('.teacher-assignment-card')].find(c => c.offsetParent !== null && c.textContent.includes(title));
      const button = card?.querySelector('[data-speaking-upload]'); if (!button) return false; button.click(); return true;
    }, 'Teacher uploads');
    if (!opened || !await waitFor(() => visible(page, '.upload-dialog'))) return false;
    const fill = async (index, name, email) => page.evaluate((i, n, e) => {
      const rows = [...document.querySelectorAll('.upload-dialog .upload-student-row')];
      const [nameInput, emailInput] = rows[i].querySelectorAll('input');
      for (const [input, value] of [[nameInput, n], [emailInput, e]]) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }
    }, index, name, email);
    await fill(0, 'Dee Student', 'dee.student@example.com');
    await clickText(page, 'button', 'Add student');
    await fill(1, 'Ana Lima', 'speaking-student@example.com');
    return true;
  }
  async function toRecordings(page) {
    await clickText(page, 'button', 'Next: add recordings');
    if (!await waitFor(() => visible(page, '.upload-dialog [data-speaking-dropzone]'))) return false;
    for (const input of await page.$$('.upload-dialog app-speaking-upload-picker input[type=file]')) await input.uploadFile(wavFile);
    return waitFor(() => page.evaluate(() => [...document.querySelectorAll('.upload-dialog .upload-page-card')].every(c => c.textContent.includes('sample-recording.wav'))));
  }
  const SCREENS = [
    { name: 'teacher-class-page', who: teacher, url: `/teacher/my-classes/detail/${C}`, ready: '[data-speaking-pill]' },
    { name: 'assignment-type-choice', dialog: true, who: teacher, url: `/teacher/my-classes/detail/${C}`, ready: '[data-speaking-pill]',
      act: async page => { await openCreate(page); return waitFor(() => visible(page, '.lt-choice-card')); } },
    { name: 'speaking-form', dialog: true, who: teacher, url: `/teacher/my-classes/detail/${C}`, ready: '[data-speaking-pill]',
      act: async page => { await openCreate(page); await waitFor(() => visible(page, '[data-choice="speaking"]'));
        await page.evaluate(() => [...document.querySelectorAll('[data-choice="speaking"]')].find(e => e.offsetParent !== null)?.click());
        return waitFor(() => visible(page, 'app-speaking-assignment-form form, app-speaking-assignment-form input')); } },
    { name: 'writing-form (compare)', dialog: true, who: teacher, url: `/teacher/my-classes/detail/${C}`, ready: '[data-speaking-pill]',
      act: async page => { await openCreate(page); await waitFor(() => visible(page, '[data-choice="writing"]'));
        await page.evaluate(() => [...document.querySelectorAll('[data-choice="writing"]')].find(e => e.offsetParent !== null)?.click());
        return waitFor(() => visible(page, 'app-assignment-form input')); } },
    { name: 'student-class-page', who: student, url: `/student/my-classes/detail/${C}`, ready: '[data-speaking-pill]', check: noLeak },
    { name: 'upload-dialog', dialog: true, who: student, url: `/student/my-classes/detail/${C}`, ready: '[data-speaking-pill]', check: noLeak,
      act: async page => {
        await clickText(page, 'button', 'Upload Recording');
        if (!await waitFor(() => visible(page, '[data-speaking-dropzone]'))) return false;
        const input = await page.$('app-speaking-upload-dialog input[type=file]');
        await input.uploadFile(wavFile);
        return waitFor(() => page.evaluate(() => document.body.innerText.includes('sample-recording.wav')));
      } },
    { name: 'essay-upload-dialog (compare)', dialog: true, who: student, url: `/student/my-classes/detail/${C}`, ready: '[data-speaking-pill]',
      act: async page => { await clickText(page, 'button', 'Upload Essay'); return waitFor(() => visible(page, '.essay-dropzone')); } },
    { name: 'student-speaking-no-recording', who: student, url: speakingPage(A.none), ready: 'button.btn-primary', check: noLeak },
    { name: 'student-speaking-transcribing', who: student, url: speakingPage(A.transcribing), ready: 'app-analysis-progress .stage', check: noLeak },
    { name: 'student-speaking-assessing', who: student, url: speakingPage(A.assessing), ready: 'app-analysis-progress .stage', check: noLeak },
    { name: 'student-speaking-result', who: student, url: speakingPage(A.ready), ready: 'app-speaking-result-view [data-criterion]', check: noLeak },
    { name: 'student-speaking-result-fillers', who: student, url: speakingPage(A.ready), ready: 'app-speaking-transcript input[type=checkbox]', check: noLeak,
      act: async page => { await page.click('app-speaking-transcript input[type=checkbox]'); return waitFor(() => page.evaluate(() => document.body.innerText.includes('(um)'))); } },
    { name: 'student-speaking-marks-hidden', who: student, url: speakingPage(A.hidden), ready: 'app-speaking-result-view .marks-hidden-notice', check: noLeak },
    { name: 'student-speaking-off-topic', who: student, url: speakingPage(A.offTopic), ready: '[data-score-note]', check: text => noLeak(text) && !/62\.5/.test(text) },
    { name: 'student-speaking-teacher-will-check', who: student, url: speakingPage(A.blocked), ready: 'app-analysis-progress .stage', check: noLeak },
    { name: 'student-speaking-not-enough-speech', who: student, url: speakingPage(A.short), ready: 'app-analysis-progress .stage', check: noLeak },
    { name: 'student-speaking-not-english', who: student, url: speakingPage(A.notEnglish), ready: 'app-analysis-progress .stage', check: noLeak },
    { name: 'student-speaking-transcription-failed', who: student, url: speakingPage(A.failed), ready: 'app-analysis-progress .stage', check: noLeak },
    { name: 'teacher-speaking-result-cap', who: teacher, url: `/teacher/my-classes/detail/speaking-submission/${offTopic.submission._id}?classId=${C}`, ready: '[data-cap-info]' },
    { name: 'teacher-speaking-result-corrections', who: teacher, url: `/teacher/my-classes/detail/speaking-submission/${ready.submission._id}?classId=${C}`, ready: '[data-speaking-corrections]' },
    { name: 'teacher-speaking-no-credits', who: teacher, url: `/teacher/my-classes/detail/speaking-submission/${blocked.submission._id}?classId=${C}`, ready: 'app-analysis-progress .stage' },
    // Stage 9: "Upload for a student" (students, recordings, review), the submissions list with teacher uploads, and a student's teacher-uploaded result.
    { name: 'teacher-upload-students', dialog: true, who: teacher, url: `/teacher/my-classes/detail/${C}`, ready: '[data-speaking-upload]', act: openTeacherUpload },
    { name: 'teacher-upload-recordings', dialog: true, who: teacher, url: `/teacher/my-classes/detail/${C}`, ready: '[data-speaking-upload]',
      act: async page => (await openTeacherUpload(page)) && toRecordings(page) },
    { name: 'teacher-upload-review', dialog: true, who: teacher, url: `/teacher/my-classes/detail/${C}`, ready: '[data-speaking-upload]',
      act: async page => (await openTeacherUpload(page)) && (await toRecordings(page)) && clickText(page, 'button', 'Next: review')
        .then(() => waitFor(() => visible(page, '.upload-credits'))) },
    { name: 'submissions-with-teacher-uploads', dialog: true, who: teacher, url: `/teacher/my-classes/detail/${C}`, ready: '[data-speaking-upload]',
      act: async page => { await page.evaluate(title => {
        const card = [...document.querySelectorAll('.teacher-assignment-card')].find(c => c.offsetParent !== null && c.textContent.includes(title));
        [...(card?.querySelectorAll('button') || [])].find(b => b.textContent.includes('View Submissions'))?.click();
      }, 'Teacher uploads'); return waitFor(() => page.evaluate(() => document.querySelectorAll('[data-teacher-upload]').length >= 3)); } },
    { name: 'student-teacher-uploaded-result', who: student, url: speakingPage(A.teacherUploads), ready: 'app-speaking-result-view [data-criterion]',
      check: text => noLeak(text) && !/Replace recording/.test(text) }
  ];

  for (const screen of SCREENS) {
    for (const viewport of VIEWPORTS) {
      const label = `${screen.name}@${viewport.name}`;
      const entry = { screen: screen.name, viewport: viewport.name, ok: false };
      let context;
      try {
        const opened = await open(viewport, screen.who, screen.url);
        context = opened.context;
        const page = opened.page;
        entry.ready = await waitFor(() => visible(page, screen.ready), 40000);
        if (entry.ready && screen.act) entry.acted = await screen.act(page);
        await sleep(screen.dialog ? 1500 : 600);
        const file = `${screen.name.replace(/[^a-z0-9-]+/gi, '_')}-${viewport.name}.png`;
        // A dialog is fixed: the viewport shows it as the user sees it (a full-page capture would cut it off).
        await page.screenshot({ path: path.join(out, file), fullPage: !screen.dialog });
        entry.screenshot = file;
        entry.overflow = await overflow(page);
        const text = await textOf(page);
        entry.statusText = await page.evaluate(() => [...document.querySelectorAll('app-analysis-progress .stage')].map(e => e.textContent.trim().replace(/\s+/g, ' ')).join(' | '));
        entry.heading = await page.evaluate(() => (document.querySelector('h1, .upload-modal-header h2')?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80));
        if (screen.check) entry.textCheck = screen.check(text);
        entry.consoleErrors = opened.seen.console;
        entry.failedCalls = opened.seen.calls;
        if (viewport.name === '1280') entry.styles = await page.evaluate(() => {
          const pick = selector => { const el = [...document.querySelectorAll(selector)].find(e => e.offsetParent !== null); if (!el) return null;
            const s = getComputedStyle(el); return { font: `${s.fontFamily.split(',')[0]} ${s.fontSize} ${s.fontWeight}`, color: s.color, background: s.backgroundColor,
              radius: s.borderRadius, padding: s.padding, border: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}` }; };
          return { h2: pick('.upload-modal-header h2'), eyebrow: pick('.upload-modal-eyebrow'), detail: pick('.assignment-upload-detail'), dropzone: pick('.essay-dropzone'),
            sectionHeading: pick('.upload-section-heading p'), danger: pick('.upload-modal-actions .btn-danger'), input: pick('form input[type=text], form input:not([type])'),
            label: pick('form label'), primary: pick('form button.btn-primary, form .btn-primary'), pill: pick('[data-speaking-pill]'), card: pick('.gradient-card') };
        });
        entry.ok = Boolean(entry.ready && (screen.act ? entry.acted : true) && !entry.overflow.overflowing && !entry.consoleErrors.length && !entry.failedCalls.length
          && entry.textCheck !== false);
      } catch (error) {
        entry.error = String(error?.message || error).slice(0, 300);
      } finally {
        await context?.close().catch(() => {});
      }
      report.screens.push(entry);
      if (!entry.ok) report.failures.push(label);
      console.log(`${entry.ok ? 'PASS' : 'FAIL'}  ${label}${entry.ok ? '' : ` :: ${JSON.stringify({ ready: entry.ready, acted: entry.acted, overflow: entry.overflow?.offenders, console: entry.consoleErrors, calls: entry.failedCalls, text: entry.textCheck, error: entry.error })}`}`);
    }
  }

  // ---- The speaking screens next to the writing screens they copy (1280 px, computed styles) ----
  const at = name => report.screens.find(s => s.screen === name && s.viewport === '1280')?.styles || {};
  const compare = (what, a, b, keys) => {
    for (const key of keys) {
      const left = at(a)[key], right = at(b)[key];
      const same = JSON.stringify(left) === JSON.stringify(right);
      report.styleComparisons.push({ what: `${what}: ${key}`, same, speaking: left, writing: right });
      console.log(`${same ? 'SAME' : 'DIFF'}  ${what}: ${key}${same ? '' : ` :: speaking ${JSON.stringify(left)} / writing ${JSON.stringify(right)}`}`);
    }
  };
  compare('upload dialog', 'upload-dialog', 'essay-upload-dialog (compare)', ['h2', 'eyebrow', 'detail', 'dropzone', 'sectionHeading', 'danger']);
  compare('assignment form', 'speaking-form', 'writing-form (compare)', ['input', 'label']);

  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\n${report.screens.length} screenshots in ${out}; ${report.failures.length} failing; notes: ${report.notes.join('; ')}`);
  await browser.close(); apiServer.close(); site.close();
  await disconnectInMemoryMongo();
  fs.rmSync(uploadRoot, { recursive: true, force: true });
  process.exit(report.failures.length ? 1 : 0);
})().catch(async error => {
  console.error('qa-speaking-flows failed:', error);
  process.exit(2);
});
