'use strict';
// Captures the four "How it works" screenshots for the landing page from the real app: real backend code in-process, an in-memory
// database and synthetic data only (fake names, example.com emails, a made-up essay). No real account, no network except Google Fonts.
//   node scripts/capture-landing-screens.cjs [outputDir]     (needs the backend next to this repo, and npm run build:prod)
// Writes, per step: <name>.webp 1500x1000, <name>@2x.webp 3000x2000, <name>.png 1500x1000 (desktop and tablet), the same as
// <name>-phone*.{webp,png} at 720x480 and 1200x800 (phones), and capture-report.json (crop, scale, smallest rendered text sizes).
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
    `beach every morning. I eated ${pick(4, 'fresh', 'fresh grilled')} fish and played ${pick(1, 'football', 'beach football')} with my cousins. ${pick(3, 'In the evening', 'Every evening')} we sit together ` +
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


// ---------------------------------------------------------------------------------------------------------------------------------
// Each image shows one focused part of a real screen. The crop is the smallest 3:2 region that holds the step's subject, whose edges
// cut through no text line, button, field or card, and that keeps text legible at the size the landing page shows the image:
// body text 10px or more, headings, buttons and chips 12px or more (rendered size = CSS font size x displayed width / crop width).
const sharp = need('node_modules/sharp');
const LEGIBLE = { body: 10, strong: 12 };
const TARGETS = {
  desktop: { displayed: 720, viewport: { width: 1040, height: 1000 }, dsf: 5, sizes: [[1500, 1000, ''], [3000, 2000, '@2x']] },   // 768px and wider
  phone: { displayed: 358, viewport: { width: 360, height: 800 }, dsf: 4, sizes: [[720, 480, ''], [1200, 800, '@2x']] },        // a 390px phone
};
const MARGIN = 8;

/** Helpers installed in the page: boxes, the "atoms" an edge must not cut, legibility of the text inside a region. */
function installHelpers() {
  const box = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
  const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
  // The innermost visible element (of `sel`) whose text matches: a container whose text merely starts the same way is skipped.
  const byText = (sel, re, root = document) => { const rx = new RegExp(re); const hits = [...root.querySelectorAll(sel)].filter(e => visible(e) && rx.test(e.textContent.trim()));
    return hits.find(e => !hits.some(o => o !== e && e.contains(o))); };
  // The largest ancestor of `el` whose box does not contain `other` (the card holding el, stopping before the shared container).
  const cardUntil = (el, other) => { const o = box(other); let n = el, best = el;
    while (n && n !== document.body) { const b = box(n); if (b.y <= o.y + 1 && b.bottom >= o.bottom - 1 && b.x <= o.x + 1 && b.right >= o.right - 1) break; best = n; n = n.parentElement; }
    return best; };
  const largestBelow = (el, maxH) => { let n = el, best = el; while (n && n !== document.body && box(n).h <= maxH) { best = n; n = n.parentElement; } return best; };
  const atoms = (root = document.body) => {
    const list = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) { const t = walker.currentNode; if (!t.textContent.trim() || !visible(t.parentElement)) continue;
      const range = document.createRange(); range.selectNodeContents(t);
      for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) list.push({ x: r.left, y: r.top, right: r.right, bottom: r.bottom }); }
    for (const el of root.querySelectorAll('button, input, select, textarea, img, svg, label, [data-row-key], [role="button"], .correction-highlight, *')) {
      if (!visible(el)) continue; const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || cs.position === 'fixed') continue;
      // A framed box is an atom (a card, field or chip); one that holds several buttons is a container (a toolbar or panel) and may be
      // cut between its rows, since its buttons are atoms themselves.
      const framed = (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(cs.borderTopWidth) > 0) && parseFloat(cs.borderTopLeftRadius) > 0
        && el.querySelectorAll('button').length < 2;
      if (/^(BUTTON|INPUT|SELECT|TEXTAREA|IMG|svg|LABEL)$/.test(el.tagName) || el.matches('[data-row-key], [role="button"], .correction-highlight') || (framed && r.height <= 260))
        list.push({ x: r.left, y: r.top, right: r.right, bottom: r.bottom });
    }
    return list;
  };
  // Fixed bars (app header, bottom navigation) the region must stay clear of; the modal backdrop is not one.
  const bars = () => { let top = 0, bottom = innerHeight;
    for (const el of document.querySelectorAll('body *')) { const cs = getComputedStyle(el); if (!/fixed|sticky/.test(cs.position) || !visible(el)) continue;
      const r = el.getBoundingClientRect(); if (r.height > innerHeight * 0.6 || r.width < innerWidth * 0.5) continue;
      if (r.top < 120) top = Math.max(top, r.bottom); else if (r.bottom > innerHeight - 160) bottom = Math.min(bottom, r.top); }
    const header = document.querySelector('header.desktop-dashboard-header'); if (header && visible(header)) top = Math.max(top, header.getBoundingClientRect().bottom);
    return { top, bottom }; };
  /** Every text inside the region with its rendered size at `displayed` px; strong = heading, button or chip. */
  const legibility = (region, displayed, scope) => {
    const k = displayed / region.w, rows = [];
    const walker = document.createTreeWalker(scope ? document.querySelector(scope) : document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) { const t = walker.currentNode; const p = t.parentElement; if (!t.textContent.trim() || !visible(p)) continue;
      const range = document.createRange(); range.selectNodeContents(t); const r = range.getBoundingClientRect();
      if (r.left < region.x - 1 || r.right > region.x + region.w + 1 || r.top < region.y - 1 || r.bottom > region.y + region.h + 1) continue;
      const cs = getComputedStyle(p); const fs = parseFloat(cs.fontSize);
      // Strong: a heading, a button label (a short one: a large clickable area such as a dropzone is not a button label) or a chip.
      const control = p.closest('button,[role="button"]');
      let strong = !!p.closest('h1,h2,h3,h4,h5,h6') || (!!control && control.textContent.trim().replace(/\s+/g, ' ').length <= 40);
      for (let n = p, i = 0; n && i < 3 && !strong; n = n.parentElement, i++) { const c = getComputedStyle(n); const b = n.getBoundingClientRect();
        if (parseFloat(c.borderTopLeftRadius) >= 6 && b.height <= 40 && (c.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(c.borderTopWidth) > 0) && n.textContent.trim().length <= 32) strong = true; }
      rows.push({ text: t.textContent.trim().replace(/\s+/g, ' ').slice(0, 40), css: fs, rendered: +(fs * k).toFixed(2), strong }); }
    return rows; };
  const wrappedHighlights = region => [...document.querySelectorAll('.correction-highlight')].filter(el => visible(el) && el.getClientRects().length > 1)
    .filter(el => { const r = el.getBoundingClientRect(); return r.bottom > region.y && r.top < region.y + region.h && r.right > region.x && r.left < region.x + region.w; })
    .map(el => el.textContent.trim());
  // Capture staging: no animation, transition, caret, scrollbar, focus ring or hover; fonts loaded.
  const stage = () => { if (!document.getElementById('capture-stage')) { const s = document.createElement('style'); s.id = 'capture-stage';
      s.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' +
        '*{scrollbar-width:none!important}::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}'; document.head.appendChild(s); }
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); };
  const scroller = el => { let n = el.parentElement; while (n && !(n.scrollHeight > n.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(n).overflowY))) n = n.parentElement; return n || document.scrollingElement; };
  window.__cap = { box, visible, byText, cardUntil, largestBelow, atoms, bars, legibility, wrappedHighlights, stage, scroller };
}

/** The smallest clean 3:2 region holding `subject` inside `bounds`, no wider than `wMax`. */
function solveCrop({ subject, atoms, bounds, wMax, margin = MARGIN }) {
  const MARGIN = margin;
  subject = { x: Math.floor(subject.x), y: Math.floor(subject.y), right: Math.ceil(subject.right), bottom: Math.ceil(subject.bottom) };
  const need = { w: subject.right - subject.x + 2 * MARGIN, h: subject.bottom - subject.y + 2 * MARGIN };
  // An edge must clear every atom by at least 1px (an underline or border touching the edge reads as cut).
  const crossY = (y, left, right) => atoms.some(a => a.right > left && a.x < right && a.y - 1 < y && y < a.bottom + 1);
  const crossX = (x, top, bottom) => atoms.some(a => a.bottom > top && a.y < bottom && a.x - 1 < x && x < a.right + 1);
  const startW = Math.ceil(Math.max(need.w, need.h * 1.5));
  if (process.env.CAPTURE_DEBUG) console.log('solve', JSON.stringify({ subject, need, startW, wMax, bounds }));
  for (let w = startW; w <= wMax; w++) {
    const h = Math.round((w * 2) / 3);   // 3:2 to within half a pixel; the export resizes to exactly 3:2
    const cx = (subject.x + subject.right) / 2, slackX = w - need.w, slackY = h - need.h;
    const lefts = [], tops = [];
    for (let d = 0; d <= slackX / 2; d++) lefts.push(cx - w / 2 + d, cx - w / 2 - d);
    for (let d = 0; d <= slackY; d++) { const mid = subject.y - MARGIN - slackY / 2; tops.push(mid + d, mid - d); }
    for (const left of lefts) {
      const L = Math.round(left);
      if (L < bounds.left || L + w > bounds.right || L > subject.x - MARGIN || L + w < subject.right + MARGIN) continue;
      for (const top of tops) {
        const T = Math.round(top);
        if (process.env.CAPTURE_DEBUG && left === lefts[0]) console.log('try', JSON.stringify({ w, h, L, T, tops: tops.slice(0, 3) }));
        if (T < bounds.top || T + h > bounds.bottom || T > subject.y - MARGIN || T + h < subject.bottom + MARGIN) continue;
        if (crossY(T, L, L + w) || crossY(T + h, L, L + w) || crossX(L, T, T + h) || crossX(L + w, T, T + h)) {
          if (process.env.CAPTURE_DEBUG && left === lefts[0]) console.log('reject', { w, L, T, top: crossY(T, L, L + w) && atoms.filter(a => a.right > L && a.x < L + w && a.y + 1 < T && T < a.bottom - 1).slice(0, 2),
            bottom: crossY(T + h, L, L + w) && atoms.filter(a => a.right > L && a.x < L + w && a.y + 1 < T + h && T + h < a.bottom - 1).slice(0, 2), left: crossX(L, T, T + h) && atoms.filter(a => a.bottom > T && a.y < T + h && a.x + 1 < L && L < a.right - 1).slice(0, 2),
            right: crossX(L + w, T, T + h) && atoms.filter(a => a.bottom > T && a.y < T + h && a.x + 1 < L + w && L + w < a.right - 1).slice(0, 2) });
          continue;
        }
        return { x: L, y: T, w, h };
      }
    }
  }
  return null;
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
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--hide-scrollbars'] });
  const base = `http://localhost:${FRONT_PORT}`;
  const teacherJwt = signTestJwt({ id: fixture.teacher._id, role: 'teacher', firebaseUid: fixture.teacher.firebaseUid });
  const studentJwt = signTestJwt({ id: fixture.student._id, role: 'student', firebaseUid: fixture.student.firebaseUid });
  const reviewUrl = `${base}/teacher/my-classes/detail/student-submissions/${fixture.student._id}?classId=${fixture.IDS.class}&assignmentId=${fixture.IDS.assignment}&submissionId=${fixture.IDS.registered}`;
  const consoleErrors = [], report = {};

  async function open(jwt, url, target) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ ...target.viewport, deviceScaleFactor: target.dsf });
    await page.evaluateOnNewDocument(token => { localStorage.setItem('backend_jwt', token); }, jwt);
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(`${url.replace(base, '').replace(/[a-f0-9]{24}/g, ':id').slice(0, 60)}: ${msg.text().slice(0, 140)}`); });
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
    await page.waitForSelector('app-root', { timeout: 60000 });
    await page.evaluate(installHelpers);
    return { page, context };
  }
  const ready = async (page, re) => { await page.waitForFunction(src => new RegExp(src).test(document.body.innerText), { timeout: 60000 }, re.source); await sleep(900); };
  const clickText = (page, re, scope = 'button') => page.evaluate((src, sel) => {
    const el = [...document.querySelectorAll(sel)].find(b => new RegExp(src).test(b.textContent.trim()) && b.getClientRects().length > 0);
    if (!el) return false; el.click(); return true; }, re.source, scope);
  // The dialog backdrop is lightened (a soft dim and a slight blur), so the page behind still reads as the app.
  const softenBackdrop = page => page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      if (cs.position === 'fixed' && r.width >= innerWidth - 2 && r.height >= innerHeight - 2 && (cs.backdropFilter !== 'none' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)')) {
        el.style.setProperty('background-color', 'rgba(17, 24, 39, 0.22)', 'important');
        el.style.setProperty('backdrop-filter', 'blur(1.5px)', 'important');
        el.style.setProperty('-webkit-backdrop-filter', 'blur(1.5px)', 'important');
      }
    }
  });

  /**
   * Finds the subject (a function run in the page that returns { subject, scope? }), scrolls it into view, solves the crop, measures
   * legibility and captures. Returns the record for the report; throws if no legible clean crop exists.
   */
  async function capture(page, name, kind, locate) {
    const target = TARGETS[kind];
    await page.evaluate(() => { window.__cap.stage(); return document.fonts.ready; });
    await page.evaluate(locate.scroll || (() => {}));
    await sleep(500);
    const found = await page.evaluate(locate.find, locate.arg ?? null);
    if (!found) { await page.screenshot({ path: path.join(out, `not-found-${name}-${kind}.png`) }); throw new Error(`${name} (${kind}): subject not found`); }
    const { subject, scopeSelector, maxCss, margin } = found;
    // The widest crop that still renders the subject's smallest texts legibly.
    // Text behind a dialog's backdrop is not meant to be read, so a dialog's legibility is measured inside the dialog.
    const texts = await page.evaluate((s, d, sc) => window.__cap.legibility({ x: s.x, y: s.y, w: s.right - s.x, h: s.bottom - s.y }, d, sc), subject, target.displayed, scopeSelector || null);
    const minBody = Math.min(...texts.filter(t => !t.strong).map(t => t.css)), minStrong = Math.min(...texts.filter(t => t.strong).map(t => t.css));
    const wMax = Math.floor(Math.min(target.displayed * minBody / LEGIBLE.body, target.displayed * minStrong / LEGIBLE.strong, maxCss || Infinity));
    const { atoms, bars } = await page.evaluate(sel => ({ atoms: window.__cap.atoms(sel ? document.querySelector(sel) : document.body), bars: window.__cap.bars() }), scopeSelector || null);
    const bounds = { left: 0, right: target.viewport.width, top: Math.ceil(bars.top) + 2, bottom: Math.floor(bars.bottom) - 2 };
    // A full-width subject (a phone bottom sheet) meets the screen edges; keep it inside the screen.
    subject.x = Math.max(subject.x, bounds.left + MARGIN); subject.right = Math.min(subject.right, bounds.right - MARGIN);
    const region = solveCrop({ subject, atoms, bounds, wMax, margin });
    if (!region) await page.screenshot({ path: path.join(out, `no-crop-${name}-${kind}.png`) });
    if (!region) throw new Error(`${name} (${kind}): no clean legible crop (subject ${Math.round(subject.right - subject.x)}x${Math.round(subject.bottom - subject.y)}, max width ${wMax}, bounds ${JSON.stringify(bounds)}; smallest texts ${JSON.stringify(texts.sort((x, y) => x.css - y.css).slice(0, 6))})`);
    const rows = await page.evaluate((r, d, sc) => window.__cap.legibility(r, d, sc), region, target.displayed, scopeSelector || null);
    const wrapped = await page.evaluate(r => window.__cap.wrappedHighlights(r), region);
    const body = rows.filter(r => !r.strong).sort((a, b) => a.rendered - b.rendered)[0], strong = rows.filter(r => r.strong).sort((a, b) => a.rendered - b.rendered)[0];
    const raw = await page.screenshot({ clip: { x: region.x, y: region.y, width: region.w, height: region.h }, captureBeyondViewport: false });
    const stem = `${name}${kind === 'phone' ? '-phone' : ''}`;
    for (const [w, h, suffix] of target.sizes) {
      const img = sharp(raw).resize(w, h, { kernel: 'lanczos3' });
      await img.clone().webp({ quality: 90, effort: 6 }).toFile(path.join(out, `${stem}${suffix}.webp`));
      if (!suffix) await img.clone().png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(path.join(out, `${stem}.png`));
    }
    const record = { kind, viewport: target.viewport, deviceScaleFactor: target.dsf, crop: region, captured: [region.w * target.dsf, region.h * target.dsf],
      displayedWidth: target.displayed, scale: +(target.displayed / region.w).toFixed(3),
      smallestBody: body && `${body.rendered}px ("${body.text}", ${body.css}px in the app)`, smallestStrong: strong && `${strong.rendered}px ("${strong.text}", ${strong.css}px in the app)`,
      legible: (!body || body.rendered >= LEGIBLE.body) && (!strong || strong.rendered >= LEGIBLE.strong), wrappedHighlights: wrapped };
    report[stem] = record;
    console.log(`${stem}: crop ${region.w}x${region.h} at ${region.x},${region.y}; body ${record.smallestBody}; strong ${record.smallestStrong}; legible ${record.legible}${wrapped.length ? `; wrapped ${wrapped}` : ''}`);
    return record;
  }

  // ---- Subjects (each function runs in the page) ----
  const createClass = { find: () => { const c = window.__cap; const h = c.byText('h2', '^Create New Class$'); if (!h) return null;
      let modal = h; while (modal.parentElement && c.box(modal.parentElement).w < innerWidth * 0.95) modal = modal.parentElement;
      modal.setAttribute('data-capture-scope', ''); const b = c.box(modal);
      return { subject: { x: b.x, y: b.y, right: b.right, bottom: b.bottom }, scopeSelector: '[data-capture-scope]' }; } };
  const createClassPhone = { find: () => { const c = window.__cap; const h = c.byText('h2', '^Create (A )?New Class$'); if (!h) return null;
      // The bottom sheet: the nearest ancestor that holds the form fields.
      let modal = h; while (modal.parentElement && [...modal.querySelectorAll('input, select, textarea')].filter(c.visible).length < 3) modal = modal.parentElement;
      modal.setAttribute('data-capture-scope', ''); const m = c.box(modal);
      const fields = [...modal.querySelectorAll('input, select, textarea')].filter(c.visible).map(c.box).sort((a, b) => a.y - b.y);
      return { subject: { x: m.x, y: c.box(h).y, right: m.right, bottom: fields[1].bottom }, scopeSelector: '[data-capture-scope]' }; } };
  const uploadEssay = phone => ({ arg: phone, find: isPhone => { const c = window.__cap; const drop = c.byText('p,span,div', '^(Drop files here|Tap here to choose files)'); if (!drop) return null;
      let modal = drop; while (modal && (c.box(modal).w < Math.min(700, innerWidth - 24) || getComputedStyle(modal).backgroundColor === 'rgba(0, 0, 0, 0)')) modal = modal.parentElement;
      modal.setAttribute('data-capture-scope', ''); const m = c.box(modal);
      const zone = c.largestBelow(drop, 260); const z = c.box(zone);
      if (isPhone) return { subject: { x: m.x, y: z.y, right: m.right, bottom: z.bottom }, scopeSelector: '[data-capture-scope]' };
      const title = c.byText('p,span,div,label', '^Title$', modal); const desc = c.byText('p,span,div,label', '^Description$', modal);
      const card = c.box(c.cardUntil(title, desc));
      // From the first information card to the bottom of the dropzone, with a tighter margin (the gaps around them are ~20px).
      return { subject: { x: m.x, y: card.y, right: m.right, bottom: z.bottom }, scopeSelector: '[data-capture-scope]', margin: 4 }; } });
  const analysis = { scroll: () => document.querySelector('app-tokenized-transcript').scrollIntoView({ block: 'center' }),
    find: () => { const c = window.__cap; const score = c.byText('p,span,div,h2,h3', '^Overall Score'); const stats = c.byText('p,span,div,h2,h3', '^Correction Statistics');
      const transcript = document.querySelector('app-tokenized-transcript'); const detail = c.byText('h2,h3,h4,p', '^Detailed Feedback');
      if (!score || !transcript) return null;
      const s = c.box(c.cardUntil(score, stats)), e = c.box(c.cardUntil(transcript, detail));
      return { subject: { x: Math.min(s.x, e.x), y: Math.min(s.y, e.y), right: Math.max(s.right, e.right), bottom: Math.max(s.bottom, e.bottom) } }; } };
  const analysisPhone = { scroll: () => document.querySelector('app-tokenized-transcript').scrollIntoView({ block: 'center' }),
    find: () => { const c = window.__cap; const title = c.byText('h1,h2,h3,h4', '^My Summer Holiday'); const transcript = document.querySelector('app-tokenized-transcript');
      if (!transcript) return null; const tr = c.box(transcript.querySelector('.tokenized-transcript') || transcript);
      // The first lines of the highlighted transcript (a phone frame is 240px tall).
      const hl = [...transcript.querySelectorAll('.correction-highlight')].map(c.box).filter(b => b.y < tr.y + 150);
      return { subject: { x: tr.x - 8, y: tr.y, right: tr.right + 8, bottom: Math.max(...hl.map(b => b.bottom)) } }; } };
  const review = { scroll: () => [...document.querySelectorAll('[data-row-key]')].find(window.__cap.visible).scrollIntoView({ block: 'center' }),
    find: () => { const c = window.__cap; const add = [...document.querySelectorAll('button')].find(x => c.visible(x) && x.textContent.trim() === 'Add correction');
      const card = [...document.querySelectorAll('[data-row-key]')].find(c.visible); const pane = document.querySelector('#annotation-editor-body app-tokenized-transcript');
      if (!add || !card || !pane) return null; const a = c.box(add), k = c.box(card), p = c.box(pane);
      // Both panes, the Add correction button and the first correction card.
      const panes = [...document.querySelectorAll('#annotation-editor-body *')].filter(el => c.visible(el) && c.box(el).h > 500 && c.box(el).w > 200 && c.box(el).w < 500).map(c.box);
      const left = Math.min(p.x, ...panes.map(b => b.x)), right = Math.max(k.right, a.right, ...panes.map(b => b.right));
      // 4px margin: the frame must end above the second card and start below a whole row of the "Hide all" chips.
      return { subject: { x: left, y: a.y, right, bottom: k.bottom }, margin: 4 }; } };
  const reviewPhone = { scroll: () => [...document.querySelectorAll('[data-row-key]')].find(window.__cap.visible).scrollIntoView({ block: 'center' }),
    find: () => { const c = window.__cap; const card = [...document.querySelectorAll('[data-row-key]')].find(c.visible); if (!card) return null; const k = c.box(card);
      // A whole card is taller than a legible phone frame: show it from the category line down to its edit, hide and delete buttons.
      const category = c.byText('*', 'GRAMMAR$', card); const top = category ? c.box(category).y : k.y;
      return { subject: { x: k.x, y: top, right: k.right, bottom: k.bottom }, margin: 4 }; } };

  try {
    // Step 01: the Create New Class dialog over the My Classes page.
    for (const kind of ['desktop', 'phone']) {
      const t = await open(teacherJwt, `${base}/teacher/my-classes`, TARGETS[kind]);
      await ready(t.page, /IELTS Writing Prep/);
      if (!await clickText(t.page, /^Create (A )?New Class$/)) throw new Error('Create New Class button not found');
      await sleep(900); await softenBackdrop(t.page);
      await capture(t.page, 'step-01-create-class', kind, kind === 'phone' ? createClassPhone : createClass);
      await t.context.close();
    }
    // Step 02: the student's Upload Essay dialog.
    for (const kind of ['desktop', 'phone']) {
      const t = await open(studentJwt, `${base}/student/my-classes/detail/${fixture.IDS.class}`, TARGETS[kind]);
      await ready(t.page, /A Place I Love/);
      if (!await clickText(t.page, /^Upload Essay$/)) throw new Error('Upload Essay button not found');
      await sleep(1200); await softenBackdrop(t.page);
      await capture(t.page, 'step-02-upload-essay', kind, uploadEssay(kind === 'phone'));
      await t.context.close();
    }
    // Steps 03 and 04: the teacher's review page. The essay wording is chosen so that no highlight in the image breaks across two
    // lines (a highlight's span carries template whitespace, so a break leaves a coloured sliver: a known app issue).
    // Each image may use its own wording; the first wording that gives a clean crop with no broken highlight wins.
    const pending = new Set(['step-03-ai-analysis/desktop', 'step-04-review/desktop', 'step-03-ai-analysis/phone', 'step-04-review/phone']);
    const chosen = {};
    // Where no wording avoids a broken highlight, the capture with the fewest is kept (stashed) and reported.
    const best = {};
    const stemFiles = key => { const [name, kind] = key.split('/'); const stem = `${name}${kind === 'phone' ? '-phone' : ''}`;
      return fs.readdirSync(out).filter(f => f.startsWith(`${stem}.`) || f.startsWith(`${stem}@`)); };
    const attempt = async (key, fn) => { if (!pending.has(key)) return;
      try { const r = await fn(); const stem = key.replace('/phone', '-phone').replace('/desktop', '');
        if (!r.wrappedHighlights.length) { pending.delete(key); chosen[key] = report.essayVariant; delete best[key]; return; }
        console.log(`  ${key}: broken highlight ${r.wrappedHighlights}`);
        if (!best[key] || r.wrappedHighlights.length < best[key].count) {
          const dir = path.join(out, '_best', key.replace('/', '-')); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
          for (const f of stemFiles(key)) fs.copyFileSync(path.join(out, f), path.join(dir, f));
          best[key] = { count: r.wrappedHighlights.length, dir, variant: report.essayVariant, record: report[stem] }; } }
      catch (error) { console.log(`  ${error.message.slice(0, 140)}`); } };
    for (let variant = 0; variant < 32 && pending.size; variant++) {
      await applyEssay(fixture.IDS.registered, variant);
      report.essayVariant = variant;
      for (const kind of ['desktop', 'phone']) {
        if (!pending.has(`step-03-ai-analysis/${kind}`) && !pending.has(`step-04-review/${kind}`)) continue;
        const t = await open(teacherJwt, reviewUrl, TARGETS[kind]);
        await ready(t.page, /My Summer Holiday|Sam Lee/);
        await clickText(t.page, /Transcribed Text/);
        await t.page.waitForSelector('app-tokenized-transcript .correction-highlight', { timeout: 60000 });
        await sleep(1200);
        await attempt(`step-03-ai-analysis/${kind}`, () => capture(t.page, 'step-03-ai-analysis', kind, kind === 'phone' ? analysisPhone : analysis));
        if (pending.has(`step-04-review/${kind}`)) {
          await t.page.click('[aria-controls="annotation-editor-body"]');
          await t.page.waitForSelector('#annotation-editor-body', { timeout: 30000 });
          await sleep(2000);
          // "Text only": the image pane needs real OCR word boxes, which the synthetic essay does not have.
          await clickText(t.page, /^Text only$/); await sleep(1200);
          await attempt(`step-04-review/${kind}`, () => capture(t.page, 'step-04-review', kind, kind === 'phone' ? reviewPhone : review));
        }
        await t.context.close();
      }
      console.log(`essay variant ${variant}: still pending ${JSON.stringify([...pending])}`);
    }
    for (const key of [...pending]) { if (!best[key]) continue;
      for (const f of fs.readdirSync(best[key].dir)) fs.copyFileSync(path.join(best[key].dir, f), path.join(out, f));
      report[key.replace('/phone', '-phone').replace('/desktop', '')] = best[key].record; chosen[key] = `${best[key].variant} (fewest broken highlights: ${best[key].count})`; pending.delete(key); }
    fs.rmSync(path.join(out, '_best'), { recursive: true, force: true });
    if (pending.size) throw new Error(`no clean capture for ${[...pending].join(', ')}`);
    report.essayVariants = chosen; delete report.essayVariant;
    fs.writeFileSync(path.join(out, 'capture-report.json'), JSON.stringify(report, null, 2));
  } finally {
    console.log(JSON.stringify({ out, consoleErrors: [...new Set(consoleErrors)] }, null, 2));
    await browser.close(); site.close(); apiServer.close();
    await disconnectInMemoryMongo();
    fs.rmSync(uploadRoot, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exit(1); });
