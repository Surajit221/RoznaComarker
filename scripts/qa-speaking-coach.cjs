'use strict';
// Real-browser QA of the Speaking Coach (students, guests, the teacher's progress card), against the real backend code in-process with an
// in-memory database (like the other qa-*.cjs). Chrome records with a FAKE microphone (--use-fake-device-for-media-stream), so the real
// MediaRecorder and the real upload checks run. Speech-to-text is a fake (the backend's Deepgram fixture) and every model reply is a fake: no
// speech-to-text, AI, email or other network call is ever made (any non-local fetch throws). Synthetic people and answers only.
//   1. Flow, as a student at 1280 px: Start practice, record about 6 s with the fake microphone, send, the check, the feedback, the next task.
//   2. Flow, as a guest at 390 px: the practice notice and its tick box, Start, record, send.
//   3. Screens at 1280, 900, 390 and 320 px: the student coach (idle, after feedback, completed), the guest coach (notice), the teacher card
//      (with an attempt history open). For each: a screenshot, console errors, failed calls, horizontal overflow, and on student and guest
//      screens a check that the coach shows no score, level or pass word.
//   node scripts/qa-speaking-coach.cjs [outputDir]     (needs the backend next to this repo, and npm run build:prod)
const fs = require('fs');
const path = require('path');
const BACKEND = path.resolve(__dirname, '../../backend');
const FRONT_PORT = 4411;
Object.assign(process.env, { JWT_SECRET: 'speaking-coach-qa', NODE_ENV: 'test', AUDIO_STT_ENABLED: 'true', SPEAKING_COACH_ENABLED: 'true', OPENROUTER_API_KEY: '',
  FRONTEND_URL: `http://localhost:${FRONT_PORT}`, GUEST_SUBMISSION_ENABLED: 'true', UPLOAD_BASE_PATH: `uploads/speaking-coach-qa-${process.pid}`,
  SENSITIVE_RATE_LIMIT_MAX: '100000', AUTH_READ_RATE_LIMIT_MAX: '100000', AUTH_WRITE_RATE_LIMIT_MAX: '100000', BASELINE_RATE_LIMIT_MAX: '1000000',
  SSE_TOKEN_RATE_LIMIT_MAX: '100000', COARSE_IP_RATE_LIMIT_MAX: '1000000', SPEAKING_UPLOAD_RATE_LIMIT_MAX: '100000', SPEAKING_COACH_UPLOAD_RATE_LIMIT_MAX: '100000' });
const localFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const host = new URL(String(url?.url || url)).hostname;
  if (!['127.0.0.1', 'localhost'].includes(host)) throw new Error(`REAL_NETWORK_CALL_BLOCKED ${host}`);
  return localFetch(url, init);
};
globalThis.jest = { fn: impl => { const fn = (...args) => impl(...args); fn.bodies = []; return fn; } };

const need = name => require(path.join(BACKEND, name));
const express = need('node_modules/express'), puppeteer = need('node_modules/puppeteer');
const quiet = need('src/utils/logger');
for (const level of ['debug', 'info', 'warn', 'metric', 'error']) if (typeof quiet[level] === 'function') quiet[level] = () => {};
const app = need('src/app');
const { connectInMemoryMongo, disconnectInMemoryMongo } = need('tests/helpers/testServer');
const { seedTestPlans } = need('tests/helpers/seedTestPlans');
const { seedSpeaking, makeAudioSubmission } = need('tests/helpers/speakingFixtures');
const h = need('tests/helpers/speakingAssessmentFixtures');
const { TEXTS } = need('tests/fixtures/audio/speakingBenchmark.cjs');
const FIXTURE = need('tests/fixtures/audio/deepgram-nova3-response.cjs');
const deepgram = need('src/services/audio/stt/deepgram');
const assessment = need('src/services/audio/speakingAssessment.service');
const processing = need('src/services/audio/processing');
const check = need('src/services/speakingCoach/assessment.service');
const access = need('src/services/guestAccess.service');
const User = need('src/models/user.model'), Assignment = need('src/models/assignment.model'), Submission = need('src/models/Submission');
const AudioRecording = need('src/models/AudioRecording'), AudioUsageLedger = need('src/models/AudioUsageLedger');
const SpeakingPracticeSession = need('src/models/SpeakingPracticeSession'), SpeakingPracticeAttempt = need('src/models/SpeakingPracticeAttempt');

const out = path.resolve(process.argv[2] || path.join(__dirname, '../../output/speaking-coach-qa'));
const build = path.resolve(__dirname, '../dist/rozna-comarker-fe/browser');
const VIEWPORTS = [{ name: '1280', width: 1280, height: 900 }, { name: '900', width: 900, height: 1100 }, { name: '390', width: 390, height: 844 }, { name: '320', width: 320, height: 700 }];
const report = { flows: [], screens: [], failures: [], notes: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KNOWN_CALL = /GET \/api\/(subscription\/me|credits\/wallet)[^ ]* 500/;
const KNOWN_CONSOLE = /ERR_FAILED|ERR_BLOCKED|net::|Failed to load resource|fonts\.|googleapis|gstatic|unpkg|boxicons|getMySubscription|wallet/i;
const NO_MARKS = /\d+\s*%|\bscores?\b|\bgrades?\b|\blevels?\b|\bpass(ed)?\b|\bfail(ed)?\b|Excellent|Developing|Beginning/i;
const CORRECTIONS = [{ category: 'GRAMMAR', symbol: 'AGR', quotedText: 'It have', occurrence: 1, suggestedText: 'It has', message: 'Use has with it.' },
  { category: 'VOCABULARY', symbol: 'WC', quotedText: 'by walk', occurrence: 1, suggestedText: 'on foot', message: 'We say on foot.' },
  { category: 'VOCABULARY', symbol: 'WC', quotedText: 'quiet', occurrence: 1, suggestedText: 'peaceful', message: 'A more exact word fits here.' }];
const ANSWER = 'My town is small and peaceful. It has one school and one shop. I go to school on foot every morning with my friend. '
  + 'There is a river near the park and people are friendly. I like my town because it is calm and green.';
const CHECKED = { assessable: true, notAssessableReason: 'none', onTask: true, level: 'Excellent', improved: ['You checked your verbs more carefully this time.'],
  stillWeak: ['Try to link two ideas with because.'], nextTip: 'Give one example for each idea you mention.' };

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const uploadRoot = path.resolve(BACKEND, process.env.UPLOAD_BASE_PATH);
  await connectInMemoryMongo(); await seedTestPlans();
  for (const model of [AudioRecording, AudioUsageLedger, SpeakingPracticeSession, SpeakingPracticeAttempt]) await model.createIndexes();
  const f = await seedSpeaking();
  await User.updateOne({ _id: f.teacher.user._id }, { $set: { displayName: 'Ms Rahman' } });
  await User.updateOne({ _id: f.student.user._id }, { $set: { displayName: 'Ana Lima' } });
  await Assignment.updateOne({ _id: f.assignment._id }, { $set: { allowGuestSubmission: true,
    instructions: 'Speak for one to three minutes about the town where you live: what it is like, what people do there, and what you would change.' } });
  await h.personalCredits(f.teacher.user, 50);
  const levels = { ...Object.fromEntries(h.DEFAULT_IDS.map(id => [id, 'Good'])), 'speaking-grammar': 'Developing', 'speaking-vocabulary': 'Developing' };
  const assessed = async mode => {
    const made = await makeAudioSubmission(f, { status: 'ready', seconds: 60, mode });
    await AudioRecording.collection.updateOne({ _id: made.recording._id }, { $set: { derived: { derivedTextVersion: 'audio-derived-text-v1',
      displayText: { text: TEXTS.WEAK, fillers: [] }, assessorText: TEXTS.WEAK, fluency: h.fluencyFor(TEXTS.WEAK) }, transcriptSchemaVersion: 'audio-transcript-v1', wordTimingsAvailable: true } });
    await assessment.enqueueAssessment(made.recording._id);
    report.notes.push(`${mode} assessed: ${(await assessment.runSpeakingAssessment(made.recording._id, { env: h.TEST_ENV,
      fetchImpl: h.fakeOpenRouter(h.output({ levels, corrections: CORRECTIONS })) })).status}`);
    return made;
  };
  const studentSub = await assessed('registered');
  const guestSub = await assessed('guest');
  const issued = access.issueToken();
  await Submission.collection.updateOne({ _id: guestSub.submission._id }, { $set: { 'guest.displayName': 'Dee Guest', 'guest.normalizedEmail': 'dee.guest@example.com',
    'guest.accessHash': issued.accessHash, 'guest.expiresAt': issued.expiresAt, qrToken: f.assignment.qrToken } });

  /** The worker for the latest practice attempt: the fake transcript, the synthetic answer, then the check with the fake reply. */
  async function work(reply = CHECKED) {
    const attempt = await SpeakingPracticeAttempt.findOne().sort({ createdAt: -1 }).lean();
    if (!attempt) return 'no attempt';
    const transcribed = await processing.processAudioRecording(attempt.recordingId, {
      transcribe: async () => ({ transcript: deepgram.normalize(FIXTURE), attempts: [], fallbackUsed: false }), env: process.env });
    await AudioRecording.collection.updateOne({ _id: attempt.recordingId }, { $set: { 'derived.assessorText': ANSWER, 'derived.fluency': h.fluencyFor(ANSWER) } });
    const checked = await check.runPracticeCheck(attempt._id, { env: h.TEST_ENV, fetchImpl: h.fakeOpenRouter(reply) });
    const recording = await AudioRecording.findById(attempt.recordingId).lean();
    return `transcription ${transcribed.status}, check ${checked.status}, audio deleted ${Boolean(recording.audioDeletedAt)}, recorded ${recording.contentType} ${Math.round(recording.durationSeconds)} s`;
  }

  // ---- Servers and browser ----
  const frontend = express();
  frontend.use(express.static(build));
  frontend.get(/.*/, (_req, res) => res.sendFile(path.join(build, 'index.html')));
  const listen = (server, port) => new Promise((resolve, reject) => { const l = server.listen(port, () => resolve(l)); l.on('error', reject); });
  const apiServer = await listen(app, 0), site = await listen(frontend, FRONT_PORT);
  const apiBase = `http://127.0.0.1:${apiServer.address().port}`;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const base = `http://localhost:${FRONT_PORT}`;
  const C = String(f.klass._id);

  async function open(viewport, token, url) {
    const context = await browser.createBrowserContext();
    await context.overridePermissions(base, ['microphone']);
    const page = await context.newPage();
    await page.setViewport({ width: viewport.width, height: viewport.height });
    if (token) await page.evaluateOnNewDocument(jwt => { localStorage.setItem('backend_jwt', jwt); }, token);
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
  const coachText = page => page.evaluate(() => (document.querySelector('app-speaking-coach section, app-speaking-coach-progress section') || { innerText: '' }).innerText);
  const hasText = (page, text) => page.evaluate(t => document.body.innerText.includes(t), text);
  const clickButton = (page, label) => page.evaluate(l => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith(l) && !x.disabled && x.offsetParent !== null);
    if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true;
  }, label);
  const overflow = page => page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const scroll = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const offenders = [];
    if (scroll > width + 1) for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > width + 1 && getComputedStyle(el).position !== 'fixed') {
        offenders.push(`${el.tagName.toLowerCase()}.${String(el.className || '').toString().split(/\s+/).slice(0, 2).join('.')} (right ${Math.round(r.right)})`);
        if (offenders.length >= 5) break;
      }
    }
    return { overflowing: scroll > width + 1, offenders };
  });
  async function shoot(name, page, seen, { student = false } = {}) {
    const file = path.join(out, `${name}.png`);
    await page.evaluate(() => document.querySelector('app-speaking-coach, app-speaking-coach-progress')?.scrollIntoView({ block: 'start' }));
    await sleep(300);
    await page.screenshot({ path: file, fullPage: true });
    const text = await coachText(page);
    const entry = { name, screenshot: path.basename(file), console: [...seen.console], calls: [...seen.calls], ...(await overflow(page)),
      ...(student ? { marksShown: NO_MARKS.test(text) ? text.match(NO_MARKS)[0] : null } : {}) };
    report.screens.push(entry);
    if (entry.console.length || entry.calls.length || entry.overflowing || entry.marksShown) report.failures.push(name);
  }
  const step = (flow, label, ok) => { flow.steps.push({ step: label, ok: Boolean(ok) }); if (!ok) report.failures.push(`${flow.name}: ${label}`); return ok; };

  // ---- 1. Student flow at 1280 px: start, record with the fake microphone, send, check, feedback, next task ----
  {
    const flow = { name: 'student-flow-1280', steps: [] };
    const { page, context, seen } = await open(VIEWPORTS[0], f.student.token, `/student/my-classes/detail/my-speaking/${f.assignment._id}?classId=${C}`);
    step(flow, 'coach shown with Start practice', await waitFor(() => hasText(page, 'Practise your speaking')) && await waitFor(() => hasText(page, 'Start practice')));
    await shoot('student-coach-idle-1280', page, seen, { student: true });
    step(flow, 'start opens task 1', await clickButton(page, 'Start practice') && await waitFor(() => hasText(page, 'Task 1 of 2')));
    step(flow, 'record with the microphone', await clickButton(page, 'Start recording') && await waitFor(() => hasText(page, 'Stop recording')));
    await sleep(6500);
    step(flow, 'stop: listen-back player', await clickButton(page, 'Stop recording') && await waitFor(() => page.evaluate(() => Boolean(document.querySelector('app-speaking-recorder audio')))));
    flow.recorderText = await page.evaluate(() => document.querySelector('app-speaking-recorder')?.innerText?.replace(/\s+/g, ' ').slice(0, 300) || '');
    step(flow, 'send: checking', await clickButton(page, 'Send my answer') && await waitFor(() => hasText(page, 'Checking your answer')));
    await shoot('student-coach-checking-1280', page, seen, { student: true });
    flow.worker = await work();
    step(flow, 'feedback and the next task', await waitFor(() => hasText(page, 'What got better'), 20000) && await waitFor(() => hasText(page, 'Task 2 of 2')));
    await shoot('student-coach-feedback-1280', page, seen, { student: true });
    report.flows.push(flow);
    await context.close();
  }

  // ---- 2. Guest flow at 390 px: the notice and its tick box, start, record, send ----
  {
    const flow = { name: 'guest-flow-390', steps: [] };
    const { page, context, seen } = await open(VIEWPORTS[2], null, `/guest/speaking/${guestSub.submission._id}#${issued.token}`);
    step(flow, 'notice shown, start disabled until ticked', await waitFor(() => hasText(page, 'Practice recordings are sent to a speech-to-text service'))
      && await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Start practice')?.disabled === true));
    await shoot('guest-coach-notice-390', page, seen, { student: true });
    await page.evaluate(() => document.querySelector('app-speaking-coach input[type=checkbox]')?.click());
    step(flow, 'start after the tick', await clickButton(page, 'Start practice') && await waitFor(() => hasText(page, 'Task 1 of 2')));
    step(flow, 'record and send', await clickButton(page, 'Start recording') && (await sleep(6500), await clickButton(page, 'Stop recording'))
      && await waitFor(() => page.evaluate(() => Boolean(document.querySelector('app-speaking-recorder audio')))) && await clickButton(page, 'Send my answer')
      && await waitFor(() => hasText(page, 'Checking your answer')));
    flow.worker = await work();
    step(flow, 'feedback', await waitFor(() => hasText(page, 'What got better'), 20000));
    await shoot('guest-coach-feedback-390', page, seen, { student: true });
    const stored = await SpeakingPracticeSession.findOne({ guestSubmissionId: guestSub.submission._id }).lean();
    step(flow, 'notice acceptance stored with its version', stored?.guestNotice?.version === 'speaking-coach-guest-2026-11');
    report.flows.push(flow);
    await context.close();
  }

  // ---- 3. Screens at every width ----
  const studentUrl = `/student/my-classes/detail/my-speaking/${f.assignment._id}?classId=${C}`;
  const teacherUrl = `/teacher/my-classes/detail/speaking-submission/${studentSub.submission._id}?classId=${C}`;
  const guestUrl = `/guest/speaking/${guestSub.submission._id}#${issued.token}`;
  for (const viewport of VIEWPORTS) {
    for (const [name, token, url, ready, student, action] of [
      ['student-coach', f.student.token, studentUrl, 'What got better', true],
      ['guest-coach', null, guestUrl, 'What got better', true],
      ['teacher-card', f.teacher.token, teacherUrl, 'Speaking Practice Progress', false, async page => {
        // The card title shows while it loads: wait for the tasks (their View attempts button) before opening the history.
        if (!await waitFor(() => clickButton(page, 'View attempts'))) return false;
        return waitFor(() => hasText(page, 'Student answer'));
      }]]) {
      const { page, context, seen } = await open(viewport, token, url);
      const shown = await waitFor(() => hasText(page, ready));
      if (!shown) report.failures.push(`${name}-${viewport.name}: not shown`);
      if (action && !await action(page)) report.failures.push(`${name}-${viewport.name}: action`);
      await shoot(`${name}-${viewport.name}`, page, seen, { student });
      await context.close();
    }
  }

  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ flows: report.flows, screens: report.screens.length, failures: report.failures, notes: report.notes }, null, 2));
  await browser.close();
  apiServer.close(); site.close();
  await disconnectInMemoryMongo();
  fs.rmSync(uploadRoot, { recursive: true, force: true });
  process.exitCode = report.failures.length ? 1 : 0;
})().catch(error => { console.error(`qa-speaking-coach failed: ${error?.stack || error}`); process.exitCode = 1; });
