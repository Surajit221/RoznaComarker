'use strict';
// Captures the four "How it works" screenshots for the landing page from the real app: real backend code in-process, an in-memory
// database and synthetic data only (fake names, example.com emails, a made-up essay). No real account, no network except Google Fonts.
//   node scripts/capture-landing-screens.cjs [outputDir] [scale]     (needs the backend next to this repo, and npm run build:prod)
// Writes step-01..04 as <name>.png at 1500x1000 CSS pixels times `scale` (default 2, so 3000x2000).
const fs = require('fs');
const path = require('path');
const BACKEND = path.resolve(__dirname, '../../backend');
const FRONT_PORT = 4411;
Object.assign(process.env, { JWT_SECRET: 'landing-capture', NODE_ENV: 'test', FRONTEND_URL: `http://localhost:${FRONT_PORT}`,
  UPLOAD_BASE_PATH: `uploads/landing-capture-${process.pid}`, SENSITIVE_RATE_LIMIT_MAX: '100000', AUTH_READ_RATE_LIMIT_MAX: '100000',
  AUTH_WRITE_RATE_LIMIT_MAX: '100000', ANNOTATION_RATE_LIMIT_MAX: '100000' });
const need = name => require(path.join(BACKEND, name));
const express = need('node_modules/express'), puppeteer = need('node_modules/puppeteer');
const quiet = need('src/utils/logger');
for (const level of ['debug', 'info', 'warn', 'metric']) if (typeof quiet[level] === 'function') quiet[level] = () => {};
const app = need('src/app');
const { connectInMemoryMongo, disconnectInMemoryMongo } = need('tests/helpers/testServer');
const { seedTestPlans } = need('tests/helpers/seedTestPlans');
const { signTestJwt } = need('tests/helpers/auth');
const { seedAnnotationFixture, rerunOcr } = need('tests/helpers/annotationFixture');
const Submission = need('src/models/Submission'), SubmissionFeedback = need('src/models/SubmissionFeedback'), User = need('src/models/user.model'),
  Class = need('src/models/class.model'), Assignment = need('src/models/assignment.model');

const out = path.resolve(process.argv[2] || path.join(__dirname, '../../output/landing-capture'));
const scale = Number(process.argv[3] || 2);
const VIEW = { width: 1500, height: 1000 };
const uploadRoot = path.resolve(BACKEND, process.env.UPLOAD_BASE_PATH);
const build = path.resolve(__dirname, '../dist/rozna-comarker-fe/browser');
const SUBSCRIPTION = { success: true, data: { plan: { name: 'Starter', slug: 'starter', features: { storageMB: 500 }, limits: { storageMB: 500 } },
  planStartedAt: null, planExpiresAt: null, usage: { storageMB: 19.4 },
  storage: { usedBytes: 20342374, limitBytes: 524288000, usedMb: 19.4, limitMb: 500, percent: 3.9 },
  billing: { customerConfigured: false, subscriptionId: null, status: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, paymentIssue: false } } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// A made-up student essay with a few errors in every category. Its filler wording (never an error word) has a few variants, so the
// capture can pick one where no highlight breaks across two lines (see `wrapped` below).
function essay(variant) {
  const pick = (bit, one, two) => (variant >> bit) & 1 ? two : one;
  return (`Last summer I visit my grandmother in a ${pick(0, 'small', 'quiet little')} village near the sea. The weather were very hot, so we goes to the ` +
    `beach every morning. I eated fresh fish and played ${pick(1, 'football', 'beach football')} with my cousins. ${pick(3, 'In the evening', 'Every evening')} we sit together ` +
    `and tell storys about the ${pick(2, 'old', 'good old')} days. Also, the village have a very nice market. I think it was the best holiday. ` +
    `i want to go back next year with my hole family.`).split(' ');
}
function corrections(words) {
  const at = (word, from = 0) => { const i = words.indexOf(word, from); if (i < 0) throw new Error(`essay word not found: ${word}`); return i; };
  return [
    [at('visit'), 'T', 'GRAMMAR', 'visited', 'Use the past tense for a finished holiday.'],
    [at('were'), 'AGR', 'GRAMMAR', 'was', '"The weather" is singular.'],
    [at('goes'), 'T', 'GRAMMAR', 'went', 'Keep the story in the past tense.'],
    [at('eated'), 'VF', 'GRAMMAR', 'ate', '"Eat" is irregular: ate.'],
    [at('have'), 'AGR', 'GRAMMAR', 'has', '"The village" is singular.'],
    [at('storys'), 'SP', 'MECHANICS', 'stories', 'Spelling.'],
    [at('i', at('holiday.')), 'CAP', 'MECHANICS', 'I', 'Always write "I" with a capital letter.'],
    [at('hole'), 'SP', 'MECHANICS', 'whole', 'Spelling: "whole".'],
    [[at('very', at('Also,')), at('nice')], 'WC', 'VOCABULARY', 'lively', 'Choose a more precise word than "very nice".'],
    [at('sit'), 'T', 'GRAMMAR', 'sat', 'Past tense.'],
    [at('Also,'), 'CO', 'ORGANIZATION', 'Besides that,', 'Use a linking phrase that fits the idea.'],
    [[at('I', at('market.')), at('holiday.')], 'SD', 'CONTENT', 'Add a reason', 'Say why it was the best holiday.'],
  ];
}
const RUBRIC_SCORES = {
  CONTENT: { score: 15, maxScore: 20, comment: 'The ideas are relevant. Add a reason or an example to support the main point.', issueCount: 1 },
  ORGANIZATION: { score: 16, maxScore: 20, comment: 'Clear order of events. Choose linking phrases that match the idea.', issueCount: 1 },
  GRAMMAR: { score: 17, maxScore: 25, comment: '6 grammar issues detected, mostly past tense and subject–verb agreement.', issueCount: 6 },
  VOCABULARY: { score: 15, maxScore: 20, comment: 'Word choice conveys meaning; replace general words with more precise ones.', issueCount: 1 },
  MECHANICS: { score: 7, maxScore: 10, comment: '3 mechanics issues detected: spelling and capital letters.', issueCount: 3 },
  PRESENTATION: { score: 4.5, maxScore: 5, comment: 'Neat and easy to read.', issueCount: 0 } };

/** Writes the essay, its corrections, statistics and the detailed feedback built from them, as the pipeline stores them. */
async function applyEssay(submissionId, variant) {
  const words = essay(variant), specs = corrections(words);
  await rerunOcr({ submissionId, words, specs, ocrJobId: `job-landing-${variant}` });
  const count = cat => specs.filter(s => s[2] === cat).length;
  await Submission.updateOne({ _id: submissionId }, { $set: { correctionStatistics: { grammar: count('GRAMMAR'), mechanics: count('MECHANICS'),
    content: count('CONTENT'), organization: count('ORGANIZATION'), vocabulary: count('VOCABULARY'), total: specs.length } } });
  const stored = await Submission.findById(submissionId).lean();
  const categoryScores = Object.fromEntries(Object.entries(RUBRIC_SCORES).map(([k, v]) => [k, { score: v.score, maxScore: v.maxScore, comment: v.comment }]));
  const detailedFeedback = { ...need('src/services/canonicalDetailedFeedback.service').buildDeterministicDetailedFeedback({ corrections: stored.writingCorrections,
    statistics: stored.correctionStatistics, categoryScores, sourceHash: stored.correctionSourceHash, transcript: stored.transcriptText }),
  summary: 'A clear and enjoyable story. Focus on past tense verbs and add one reason why the holiday was special.' };
  await SubmissionFeedback.collection.updateMany({}, { $set: { rubricScores: RUBRIC_SCORES, overallScore: 74.5, grade: 'C', detailedFeedback,
    evaluationSourceHash: stored.correctionSourceHash, detailedFeedbackSourceHash: stored.correctionSourceHash,
    teacherComments: 'Lovely details about the beach! Check your verbs in the past tense.' } });
}

async function seed() {
  await connectInMemoryMongo(); await seedTestPlans();
  const fixture = await seedAnnotationFixture({ uploadRoot });
  await User.updateOne({ _id: fixture.teacher._id }, { $set: { displayName: 'Ms Rahman', email: 'teacher@example.com' } });
  await User.updateOne({ _id: fixture.student._id }, { $set: { displayName: 'Sam Lee', email: 'student@example.com' } });
  await Class.updateOne({ _id: fixture.IDS.class }, { $set: { name: 'English Writing 7B', subjectLevel: 'English', description: 'Weekly essays and feedback.' } });
  const more = [['IELTS Writing Prep', 'Task 1 and Task 2 practice with model answers.'], ['Grade 8 Composition', 'Narrative and opinion essays.'],
    ['Creative Writing Club', 'Short stories and poems every week.'], ['Academic English B2', 'Paragraph structure and linking words.'],
    ['Speaking & Writing 9A', 'Describe, compare and explain.'], ['Essay Skills 10C', 'Planning, drafting and revising.'],
    ['Summer Writing Camp', 'Daily journal and feedback.']];
  for (const [i, [name, description]] of more.entries()) {
    await Class.create({ name, description, subjectLevel: 'English', teacher: fixture.teacher._id, joinCode: `LANDING-${i}` });
  }
  await Assignment.updateOne({ _id: fixture.IDS.assignment }, { $set: { title: 'My Summer Holiday', instructions: 'Write about a holiday you enjoyed.' } });
  await Assignment.create({ title: 'A Place I Love', instructions: 'Describe a place that is special to you.', class: fixture.IDS.class,
    teacher: fixture.teacher._id, qrToken: 'landing-qr-2', deadline: new Date(Date.now() + 7 * 86400000) });
  await applyEssay(fixture.IDS.registered, 0);
  // The upload route only serves stored names in the real (uuid) format.
  const File = need('src/models/File');
  for (const [fileId, submissionId, stored2] of [[fixture.IDS.fileRegistered, fixture.IDS.registered, '00000000-0000-4000-8000-0000000000f1.png'], [fixture.IDS.fileGuest, fixture.IDS.guest, '00000000-0000-4000-8000-0000000000f2.png']]) {
    fs.renameSync(path.join(uploadRoot, 'submissions', `${fileId}.png`), path.join(uploadRoot, 'submissions', stored2));
    await File.updateOne({ _id: fileId }, { $set: { filename: stored2, path: `${process.env.UPLOAD_BASE_PATH}/submissions/${stored2}`, url: `/uploads/submissions/${stored2}` } });
    await Submission.updateOne({ _id: submissionId }, { $set: { fileUrl: `/uploads/submissions/${stored2}`, fileUrls: [`/uploads/submissions/${stored2}`] } });
  }
  return fixture;
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const fixture = await seed();
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
  const consoleErrors = [], wrappedHighlights = {};

  async function open(jwt, url, ready) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ ...VIEW, deviceScaleFactor: scale });
    await page.evaluateOnNewDocument(token => { localStorage.setItem('backend_jwt', token); }, jwt);
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(`${url.replace(base, '')}: ${msg.text().slice(0, 160)}`); });
    await page.setRequestInterception(true);
    page.on('request', req => {
      const target = new URL(req.url());
      // Known fixture gap: /api/subscription/me answers 500 without real billing data, so the storage widget gets a synthetic plan.
      if (target.pathname === '/api/subscription/me') {
        const cors = { 'access-control-allow-origin': base, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET, OPTIONS',
          'access-control-allow-headers': req.headers()['access-control-request-headers'] || 'authorization, content-type' };
        if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors, body: '' });
        return req.respond({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(SUBSCRIPTION) });
      }
      if (target.pathname.startsWith('/api/') || target.pathname.startsWith('/uploads/')) return req.continue({ url: `http://127.0.0.1:${apiPort}${target.pathname}${target.search}` });
      if (['127.0.0.1', 'localhost'].includes(target.hostname) || ['data:', 'blob:'].includes(target.protocol)) return req.continue();
      if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(target.hostname)) return req.continue();   // the app font (Poppins)
      if (target.hostname === 'unpkg.com' && target.pathname.startsWith('/boxicons@')) return req.continue();   // the app icons
      if (req.resourceType() === 'stylesheet') return req.respond({ status: 200, contentType: 'text/css', body: '' });
      return req.abort();
    });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
    await page.waitForSelector(ready, { timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await sleep(1200);
    return { page, context };
  }
  const clickText = (page, re, scope = 'button') => page.evaluate((src, sel) => {
    const el = [...document.querySelectorAll(sel)].find(b => new RegExp(src).test(b.textContent.trim()) && b.offsetParent !== null);
    if (!el) return false; el.click(); return true; }, re.source, scope);
  // The dialog backdrop is lightened for the marketing image (a soft dim and a slight blur), so the page behind still reads as the app.
  const softenBackdrop = page => page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      if (cs.position === 'fixed' && r.width >= innerWidth - 2 && r.height >= innerHeight - 2 && (cs.backdropFilter !== 'none' || /rgba?\(/.test(cs.backgroundColor) && cs.backgroundColor !== 'rgba(0, 0, 0, 0)')) {
        el.style.setProperty('background-color', 'rgba(17, 24, 39, 0.22)', 'important');
        el.style.setProperty('backdrop-filter', 'blur(1.5px)', 'important');
        el.style.setProperty('-webkit-backdrop-filter', 'blur(1.5px)', 'important');
      }
    }
  });
  const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`) });

  try {
    // Step 01: My Classes with the Create New Class dialog open.
    let t = await open(teacherJwt, `${base}/teacher/my-classes`, 'app-root');
    await page_ready(t.page, /IELTS Writing Prep/);
    if (!await clickText(t.page, /^Create New Class$/)) throw new Error('Create New Class button not found');
    await sleep(900); await softenBackdrop(t.page); await sleep(300);
    await shot(t.page, 'step-01-create-class'); await t.context.close();

    // Step 02: the student's class page with the Upload Essay dialog open.
    t = await open(studentJwt, `${base}/student/my-classes/detail/${fixture.IDS.class}`, 'app-root');
    await page_ready(t.page, /A Place I Love/);
    if (!await clickText(t.page, /^Upload Essay$/)) throw new Error('Upload Essay button not found');
    await sleep(1200); await softenBackdrop(t.page); await sleep(300);
    await shot(t.page, 'step-02-upload-essay'); await t.context.close();

    // Steps 03 and 04: the teacher's review page (transcript with highlights, then the rubric scores).
    const reviewUrl = `${base}/teacher/my-classes/detail/student-submissions/${fixture.student._id}?classId=${fixture.IDS.class}&assignmentId=${fixture.IDS.assignment}&submissionId=${fixture.IDS.registered}`;
    // Scroll an element to a fixed height in the content area (the sidebar and the header stay in place).
    const scrollTo = (page, selector, offset) => page.evaluate((sel, off) => {
      const el = document.querySelector(sel); let box = el.parentElement;
      while (box && !(box.scrollHeight > box.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
      const scroller = box || document.scrollingElement;
      scroller.scrollTop += el.getBoundingClientRect().top - off; }, selector, offset);
    // A highlight that breaks across two lines leaves a coloured sliver at the line end (its span carries template whitespace, a
    // known app issue). The essay wording is chosen so that none does at this viewport, rather than editing the page.
    const wrapped = page => page.evaluate(() => [...document.querySelectorAll('.correction-highlight')]
      .filter(el => el.offsetParent !== null && el.getClientRects().length > 1).map(el => el.textContent.trim()));
    let best = null;
    for (let variant = 0; variant < 16; variant++) {
      await applyEssay(fixture.IDS.registered, variant);
      t = await open(teacherJwt, reviewUrl, 'app-root');
      await page_ready(t.page, /My Summer Holiday|Sam Lee/);
      await clickText(t.page, /Transcribed Text/);
      await t.page.waitForSelector('app-tokenized-transcript .correction-highlight', { timeout: 60000 });
      await sleep(1200);
      await scrollTo(t.page, 'app-tokenized-transcript', 330);
      await sleep(800);
      const step03 = await wrapped(t.page);
      await shot(t.page, `step-03-ai-analysis.v${variant}`);
      await t.page.click('[aria-controls="annotation-editor-body"]');
      await t.page.waitForSelector('#annotation-editor-body', { timeout: 30000 });
      await sleep(2000);
      // "Text only": the image pane needs real OCR boxes, which the synthetic essay does not have.
      if (!await clickText(t.page, /^Text only$/)) throw new Error('Text only view not found');
      await sleep(1200);
      await scrollTo(t.page, '#annotation-editor-body', 96);
      await sleep(800);
      const step04 = await wrapped(t.page);
      await shot(t.page, `step-04-review.v${variant}`);
      await t.context.close();
      const score = step03.length + step04.length;
      console.log(`essay variant ${variant}: wrapped highlights ${JSON.stringify({ step03, step04 })}`);
      if (!best || score < best.score) best = { variant, score, step03, step04 };
      if (score === 0) break;
    }
    Object.assign(wrappedHighlights, best);
    for (const name of ['step-03-ai-analysis', 'step-04-review']) {
      fs.renameSync(path.join(out, `${name}.v${best.variant}.png`), path.join(out, `${name}.png`));
      for (const f of fs.readdirSync(out)) if (f.startsWith(`${name}.v`)) fs.rmSync(path.join(out, f));
    }
  } finally {
    console.log(JSON.stringify({ out, scale, wrappedHighlights, consoleErrors }, null, 2));
    await browser.close(); site.close(); apiServer.close();
    await disconnectInMemoryMongo();
    fs.rmSync(uploadRoot, { recursive: true, force: true });
  }

  async function page_ready(page, re) {
    await page.waitForFunction(src => new RegExp(src).test(document.body.innerText), { timeout: 60000 }, re.source);
    await sleep(800);
  }
})().catch(error => { console.error(error); process.exit(1); });
