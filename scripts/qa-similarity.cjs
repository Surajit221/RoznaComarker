'use strict';
// Real-browser QA of the teacher's similarity panel (Match Overview), against the real backend code in-process with an in-memory database
// (like the other qa-*.cjs). SIMILARITY_PROVIDER=stub: no provider, AI, email or other network call is ever made (any non-local fetch
// throws). Synthetic people and essays only (the annotation fixture, plus essays built from its own words).
//   1. Flow at 1280 px: the "Check similarity" button next to Review corrections opens the view in place of the uploaded image (Close,
//      aria-expanded, focus on the heading), the panel before a check, Check similarity, the report (overall %, numbered sources, numbered
//      highlights), select a source, exclude it (announced), All sources: Excluded (1), Restore all, Check again, Close (focus back, the
//      button shows the percentage), and switching to Review corrections closes the view. No similarity card at the bottom of the page.
//   2. Screens at 1280, 900, 390 and 320 px with the view open and a completed report: screenshot, console errors, failed calls, horizontal
//      overflow, and ONE vertical scroll container with the document no taller than the window.
//   4. The page scroll at 1920x960 and 1280x720, and at the window sizes browser zoom 90/110/125% gives at 1920x960, with the view loading,
//      loaded and after Check again: exactly one vertical scroll container (the layout's main area); document height = window height.
//   3. The essay's own student and the guest never see a similarity panel on their pages (none in the DOM).
//   node scripts/qa-similarity.cjs [outputDir]     (needs the backend next to this repo, and npm run build:prod)
const fs = require('fs');
const path = require('path');
const BACKEND = path.resolve(__dirname, '../../backend');
const FRONT_PORT = 4412;
Object.assign(process.env, { JWT_SECRET: 'similarity-qa', NODE_ENV: 'test', SIMILARITY_ENABLED: 'true', SIMILARITY_PROVIDER: 'stub', SIMILARITY_CHECKS_PER_SUBMISSION: '20', OPENROUTER_API_KEY: '',
  FRONTEND_URL: `http://localhost:${FRONT_PORT}`, GUEST_SUBMISSION_ENABLED: 'true', UPLOAD_BASE_PATH: `uploads/similarity-qa-${process.pid}`,
  SENSITIVE_RATE_LIMIT_MAX: '100000', AUTH_READ_RATE_LIMIT_MAX: '100000', AUTH_WRITE_RATE_LIMIT_MAX: '100000', BASELINE_RATE_LIMIT_MAX: '1000000',
  SSE_TOKEN_RATE_LIMIT_MAX: '100000', COARSE_IP_RATE_LIMIT_MAX: '1000000' });
const localFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const host = new URL(String(url?.url || url)).hostname;
  if (!['127.0.0.1', 'localhost'].includes(host)) throw new Error(`REAL_NETWORK_CALL_BLOCKED ${host}`);
  return localFetch(url, init);
};
globalThis.jest = { fn: impl => { const fn = (...args) => impl(...args); fn.bodies = []; return fn; }, mock: () => {} };

const need = name => require(path.join(BACKEND, name));
const express = need('node_modules/express'), puppeteer = need('node_modules/puppeteer');
const quiet = need('src/utils/logger');
for (const level of ['debug', 'info', 'warn', 'metric', 'error']) if (typeof quiet[level] === 'function') quiet[level] = () => {};
const app = need('src/app');
const { connectInMemoryMongo, disconnectInMemoryMongo } = need('tests/helpers/testServer');
const { seedTestPlans } = need('tests/helpers/seedTestPlans');
const { signTestJwt } = need('tests/helpers/auth');
const { seedAnnotationFixture } = need('tests/helpers/annotationFixture');
const { classWithEssay, student, essay } = need('tests/helpers/similarityFixtures');
const internal = need('src/services/similarity/internal.service');
const { startSimilarityWorker } = need('src/services/similarity/worker');
const Class = need('src/models/class.model'), Assignment = need('src/models/assignment.model'), User = need('src/models/user.model');

const out = path.resolve(process.argv[2] || path.join(__dirname, '../../output/similarity-qa'));
const build = path.resolve(__dirname, '../dist/rozna-comarker-fe/browser');
const VIEWPORTS = [{ name: '1280', width: 1280, height: 900 }, { name: '900', width: 900, height: 1100 }, { name: '390', width: 390, height: 844 }, { name: '320', width: 320, height: 700 }];
const report = { flows: [], screens: [], failures: [], notes: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KNOWN_CALL = /GET \/api\/(subscription\/me|credits\/wallet)[^ ]* 500/;
const KNOWN_CONSOLE = /ERR_FAILED|ERR_BLOCKED|net::|Failed to load resource|fonts\.|googleapis|gstatic|unpkg|boxicons|getMySubscription|wallet/i;

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const uploadRoot = path.resolve(BACKEND, process.env.UPLOAD_BASE_PATH);
  await connectInMemoryMongo(); await seedTestPlans();
  const fixture = await seedAnnotationFixture({ uploadRoot });
  const teacher = await User.findById(fixture.IDS.teacher).lean();
  const teacherToken = signTestJwt({ id: teacher._id, role: 'teacher', firebaseUid: teacher.firebaseUid });
  const studentToken = signTestJwt({ id: fixture.student._id, role: 'student', firebaseUid: fixture.student.firebaseUid });
  // Other essays that share words with the fixture's registered essay: one in the same class (openable), one in another teacher's class.
  const mine = await internal.loadEssay(fixture.IDS.registered);
  const words = mine.tokens.map(t => mine.text.slice(t.start, t.end));
  report.notes.push(`fixture essay: ${words.length} words`);
  const klass = await Class.findById(fixture.IDS.class).lean();
  const assignment = await Assignment.findById(fixture.IDS.assignment).lean();
  const classmate = await student(klass, 'qa-classmate');
  const sameClass = await essay({ klass, assignment, studentUser: classmate.user, text: `Opening words here. ${words.slice(0, Math.min(words.length, 12)).join(' ')} and more.` });
  const other = await classWithEssay({ label: 'qa-other' });
  const otherStudent = await student(other.klass, 'qa-other-student');
  const tail = words.slice(Math.max(0, words.length - 10)).join(' ');
  const otherEssay = await essay({ ...other, studentUser: otherStudent.user, text: `Different start. ${tail} end.` });
  // Six more near-identical copies in other teachers' classes (synthetic: the fixture's own words), so there are more than five sources that
  // overlap: every one must show its own percentage, none 0%.
  const copies = [];
  for (let i = 0; i < 6; i++) {
    const c = await classWithEssay({ label: `qa-copy-${i}` });
    const st = await student(c.klass, `qa-copy-student-${i}`);
    copies.push(await essay({ ...c, studentUser: st.user, text: `Copy ${i} starts. ${words.slice(0, Math.max(8, words.length - 2 - i)).join(' ')} end.` }));
  }
  for (const sub of [sameClass, otherEssay, ...copies]) await internal.indexSubmission(sub._id);
  const worker = startSimilarityWorker({ intervalMs: 500 });

  const frontend = express();
  frontend.use(express.static(build));
  frontend.get(/.*/, (_req, res) => res.sendFile(path.join(build, 'index.html')));
  const listen = (server, port) => new Promise((resolve, reject) => { const l = server.listen(port, () => resolve(l)); l.on('error', reject); });
  const apiServer = await listen(app, 0), site = await listen(frontend, FRONT_PORT);
  const apiBase = `http://127.0.0.1:${apiServer.address().port}`;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const base = `http://localhost:${FRONT_PORT}`;
  const teacherUrl = `/teacher/my-classes/detail/student-submissions/${fixture.student._id}?classId=${fixture.IDS.class}&assignmentId=${fixture.IDS.assignment}&submissionId=${fixture.IDS.registered}`;

  async function open(viewport, token, url) {
    const context = await browser.createBrowserContext();
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
  const waitFor = async (fn, timeout = 40000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return true; await sleep(250); } return false; };
  const panelText = page => page.evaluate(() => (document.querySelector('app-similarity-report section') || { innerText: '' }).innerText);
  const clickButton = (page, label, scope = 'app-similarity-report') => page.evaluate((l, s) => {
    const b = [...document.querySelectorAll(`${s} button`)].find(x => x.textContent.trim().startsWith(l) && !x.disabled && x.offsetParent !== null);
    if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true;
  }, label, scope);
  const overflow = page => page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const scroll = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const offenders = [];
    if (scroll > width + 1) for (const el of document.querySelectorAll('app-similarity-report *')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.right > width + 1) { offenders.push(`${el.tagName.toLowerCase()}.${String(el.className || '').split(/\s+/).slice(0, 2).join('.')} (right ${Math.round(r.right)})`); if (offenders.length >= 5) break; }
    }
    return { overflowing: scroll > width + 1, panelOffenders: offenders };
  });
  /** Every element that scrolls vertically, and the document height against the window (one scroll container, no page scroll). */
  const scrollState = page => page.evaluate(() => {
    const scrollers = [];
    for (const el of [document.documentElement, ...document.querySelectorAll('body *')]) {
      const cs = getComputedStyle(el);
      const scrolls = el === document.documentElement ? el.scrollHeight > innerHeight + 1 : ['auto', 'scroll'].includes(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
      if (scrolls) scrollers.push(el === document.documentElement ? 'document' : `${el.tagName.toLowerCase()}.${String(el.className || '').split(/\s+/).slice(0, 2).join('.')}`);
    }
    return { scrollers, documentHeight: document.documentElement.scrollHeight, windowHeight: innerHeight };
  });
  // Exactly one vertical scroller: the layout's main area (wide screens; the document then must not scroll too) or the document itself
  // (narrower screens, where the layout lets the page scroll).
  const oneScroll = state => state.scrollers.length === 1 && (state.scrollers[0] === 'document' || state.documentHeight <= state.windowHeight + 1);
  const toggleState = page => page.evaluate(() => {
    const b = document.querySelector('[data-similarity-toggle]');
    return b ? { label: b.querySelector('span:last-child')?.textContent?.trim(), expanded: b.getAttribute('aria-expanded'), focused: document.activeElement === b } : null;
  });
  async function openView(page) {
    await waitFor(async () => Boolean(await toggleState(page)));
    const state = await toggleState(page);
    if (state?.expanded !== 'true') await page.evaluate(() => document.querySelector('[data-similarity-toggle]')?.click());
    return waitFor(async () => page.evaluate(() => Boolean(document.querySelector('#similarity-view app-similarity-report section'))));
  }
  async function shoot(name, page, seen) {
    const file = path.join(out, `${name}.png`);
    await page.evaluate(() => document.querySelector('app-similarity-report')?.scrollIntoView({ block: 'start' }));
    await sleep(300);
    await page.screenshot({ path: file, fullPage: false });
    const entry = { name, screenshot: path.basename(file), console: [...seen.console], calls: [...seen.calls], ...(await overflow(page)), scroll: await scrollState(page) };
    report.screens.push(entry);
    // A similarity call or console error, or overflow inside the panel, is a failure. Other page items (the fixture's essay image, the
    // teacher-evaluation 404 before one is saved, the writing-model 404 while that feature is off) are listed as page notes.
    const own = [...entry.calls, ...entry.console].filter(x => /similarity/i.test(x));
    entry.pageNotes = [...entry.calls, ...entry.console].filter(x => !/similarity/i.test(x));
    if (own.length || entry.panelOffenders.length || !oneScroll(entry.scroll)) report.failures.push(name);
  }
  const step = (flow, label, ok, detail) => { flow.steps.push({ step: label, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) }); if (!ok) report.failures.push(`${flow.name}: ${label}`); return ok; };

  // ---- 1. The flow at 1280 px ----
  {
    const flow = { name: 'teacher flow 1280', steps: [] }; report.flows.push(flow);
    const { page, context, seen } = await open(VIEWPORTS[0], teacherToken, teacherUrl);
    step(flow, 'button next to Review corrections, labelled Check similarity, closed', await waitFor(async () => page.evaluate(() => {
      const b = document.querySelector('[data-similarity-toggle]');
      return Boolean(b && b.previousElementSibling?.matches('[data-review-corrections]') && b.getAttribute('aria-expanded') === 'false'
        && b.querySelector('span:last-child')?.textContent?.trim() === 'Check similarity');
    })));
    step(flow, 'no similarity card on the page while closed', await page.evaluate(() => !document.querySelector('app-similarity-report')));
    await shoot('closed-1280', page, seen);
    step(flow, 'view opens in place of the uploaded image', await openView(page) && await page.evaluate(() => document.querySelector('[data-standalone-viewer]')?.hidden === true));
    await sleep(200);
    const opened = await toggleState(page);
    step(flow, 'button says Close, aria-expanded true, focus on the view heading', opened?.label === 'Close' && opened?.expanded === 'true'
      && await page.evaluate(() => document.activeElement?.id === 'similarity-title'), opened);
    step(flow, 'panel shown with Check similarity', await waitFor(async () => (await panelText(page)).includes('Check similarity')));
    await shoot('before-check-1280', page, seen);
    step(flow, 'Check similarity clicked', await clickButton(page, 'Check similarity'));
    step(flow, 'report ready', await waitFor(async () => (await panelText(page)).includes('of the essay matches other text')));
    const api = await page.evaluate(async (id) => (await (await fetch(`/api/similarity/submissions/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('backend_jwt')}` } })).json()).data, String(fixture.IDS.registered));
    const shown = await page.evaluate(() => document.querySelector('.overall__value')?.textContent?.trim());
    step(flow, 'overall shown equals the server\'s', shown === `${api.overallPercent}%` || (api.overallPercent === 0 && shown === '<1%'), { shown, server: api.overallPercent });
    const numbered = await page.evaluate(() => [...document.querySelectorAll('ol.sources .source__number')].map(n => n.textContent.trim()));
    step(flow, 'numbered sources 1..n', numbered.length > 0 && numbered.every((n, i) => n === String(i + 1)), numbered);
    const marks = await page.evaluate(() => [...document.querySelectorAll('mark.similarity-mark')].map(m => ({ n: m.querySelector('sup')?.textContent, label: m.getAttribute('aria-label'), tab: m.getAttribute('tabindex') })));
    step(flow, 'every highlight has its number as text, a label and keyboard focus', marks.length > 0 && marks.every(m => m.n && m.label && m.tab === '0'), marks.length);
    const otherSource = api.sources.find(s => s.kind === 'internal' && !s.open);
    step(flow, 'another teacher\'s source carries no passages or link', !otherSource || (!otherSource.spans && !otherSource.open), otherSource ? 'present' : 'not found');
    {
      const withSpans = api.sources.filter(x => x.number).findIndex(x => x.spans);
      if (withSpans >= 5) await clickButton(page, 'Show all');
      await page.evaluate(i => document.querySelectorAll('ol.sources button')[i]?.click(), Math.max(0, withSpans));
    }
    step(flow, 'selecting a source shows its matched text', await waitFor(async () => page.evaluate(() => Boolean(document.querySelector('.detail blockquote')))));
    await shoot('report-selected-1280', page, seen);
    const before = await page.evaluate(() => document.querySelector('.overall__value')?.textContent?.trim());
    step(flow, 'Exclude this source', await clickButton(page, 'Exclude this source'));
    step(flow, 'announced, and the source is excluded (recomputed on the server)', await waitFor(async () => page.evaluate(b => {
      const live = document.querySelector('app-similarity-report [aria-live="polite"]')?.textContent || '';
      return live.includes('Similarity is now') && Boolean(b);
    }, before)));
    await clickButton(page, 'All sources');
    step(flow, 'Excluded (1) listed', await waitFor(async () => (await panelText(page)).includes('Excluded (1)')));
    await shoot('all-sources-excluded-1280', page, seen);
    step(flow, 'Restore all', await clickButton(page, 'Restore all'));
    step(flow, 'restored: overall back', await waitFor(async () => page.evaluate(b => document.querySelector('.overall__value')?.textContent?.trim() === b, before)));
    {
      const api2 = await page.evaluate(async (id) => (await (await fetch(`/api/similarity/submissions/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('backend_jwt')}` } })).json()).data, String(fixture.IDS.registered));
      const counted = api2.sources.filter(x => x.number);
      step(flow, 'every counted source has its own percentage above 0 and a number; they may add up to more than the overall',
        counted.length > 5 && counted.every(x => x.words > 0 && x.percent > 0) && counted.reduce((n, x) => n + x.percent, 0) > api2.overallPercent,
        counted.map(x => [x.number, x.percent, x.sameAs]));
      step(flow, 'the overlap note is shown', (await panelText(page)).includes('Overall counts each word once; sources can overlap.'));
      await clickButton(page, 'Match overview');
      if (await page.evaluate(() => [...document.querySelectorAll('app-similarity-report button')].some(x => x.textContent.trim() === 'Show top 5'))) await clickButton(page, 'Show top 5');
      await sleep(200);
      const shownRows = await page.evaluate(() => [...document.querySelectorAll('ol.sources li')].map(li => li.textContent.replace(/\s+/g, ' ').trim()));
      step(flow, 'top 5 rows, none reads 0%, later copies say "same text as source N"', shownRows.length === 5 && !shownRows.some(r => /(^|\D)0%/.test(r))
        && shownRows.some(r => /same text as source \d+/.test(r)), shownRows);
      const clickedShowAll = await clickButton(page, 'Show all (');
      step(flow, 'Show all lists every source and is announced', clickedShowAll
        && await waitFor(async () => page.evaluate(n => document.querySelectorAll('ol.sources li').length === n
          && (document.querySelector('app-similarity-report [aria-live="polite"]')?.textContent || '').includes(`Showing all ${n} sources`), counted.length)),
        { apiCounted: counted.length, clickedShowAll, rows: await page.evaluate(() => document.querySelectorAll('ol.sources li').length), live: await page.evaluate(() => document.querySelector('app-similarity-report [aria-live="polite"]')?.textContent) });
      await shoot('show-all-1280', page, seen);
      await page.evaluate(() => document.querySelectorAll('ol.sources button')[1]?.click());
      step(flow, 'the popup says which other sources share the passage', await waitFor(async () => page.evaluate(() => /Also in sources? \d/.test(document.querySelector('.detail')?.textContent || ''))));
      await shoot('popup-also-in-1280', page, seen);
      await clickButton(page, 'Show top 5');
    }
    step(flow, 'Download PDF offered', await page.evaluate(() => [...document.querySelectorAll('app-similarity-report button')].some(b => b.textContent.trim() === 'Download PDF')));
    step(flow, 'Check again', await clickButton(page, 'Check again'));
    step(flow, 'report ready again', await waitFor(async () => (await panelText(page)).includes('of the essay matches other text') && !(await panelText(page)).includes('Checking similarity')));
    step(flow, 'one scroll container after Check again', oneScroll(await scrollState(page)), await scrollState(page));
    await page.evaluate(() => document.querySelector('[data-similarity-toggle]')?.click());
    await sleep(300);
    const closed = await toggleState(page);
    step(flow, 'Close: view gone, image back, focus on the button, the button shows the percentage', closed?.focused && /^Similarity (<1|\d+)%$/.test(closed?.label || '')
      && await page.evaluate(() => !document.querySelector('#similarity-view') && document.querySelector('[data-standalone-viewer]')?.hidden === false), closed);
    await openView(page);
    await page.evaluate(() => document.querySelector('[data-review-corrections]')?.click());
    step(flow, 'Review corrections closes the similarity view (one view at a time)', await waitFor(async () => page.evaluate(() => !document.querySelector('#similarity-view')
      && document.querySelector('[data-review-corrections]')?.getAttribute('aria-expanded') === 'true')));
    await context.close();
  }

  // ---- 2. Screens at four widths (completed report) ----
  for (const viewport of VIEWPORTS) {
    const { page, context, seen } = await open(viewport, teacherToken, teacherUrl);
    await openView(page);
    const ready = await waitFor(async () => (await panelText(page)).includes('of the essay matches other text'));
    if (!ready) report.failures.push(`screen ${viewport.name}: report not shown`);
    await shoot(`report-${viewport.name}`, page, seen);
    await context.close();
  }

  // ---- 4. One page scroll at 1920x960, 1280x720 and the zoom-equivalent window sizes (loading, loaded, after Check again) ----
  {
    const flow = { name: 'one scrollbar', steps: [] }; report.flows.push(flow);
    const sizes = [{ name: '1920x960', width: 1920, height: 960 }, { name: '1280x720', width: 1280, height: 720 },
      { name: '1920x960 zoom 90%', width: 2133, height: 1067 }, { name: '1920x960 zoom 110%', width: 1745, height: 873 }, { name: '1920x960 zoom 125%', width: 1536, height: 768 }];
    for (const size of sizes) {
      const { page, context } = await open(size, teacherToken, teacherUrl);
      await openView(page);
      step(flow, `${size.name}: view loading`, oneScroll(await scrollState(page)), await scrollState(page));
      await waitFor(async () => (await panelText(page)).includes('of the essay matches other text'));
      await sleep(500);
      step(flow, `${size.name}: report loaded`, oneScroll(await scrollState(page)), await scrollState(page));
      await clickButton(page, 'Check again');
      await waitFor(async () => (await panelText(page)).includes('Checking similarity'), 5000);
      step(flow, `${size.name}: while checking again`, oneScroll(await scrollState(page)), await scrollState(page));
      await waitFor(async () => (await panelText(page)).includes('of the essay matches other text') && !(await panelText(page)).includes('Checking similarity'));
      await sleep(500);
      step(flow, `${size.name}: after Check again`, oneScroll(await scrollState(page)), await scrollState(page));
      if (size.name === '1920x960') await page.screenshot({ path: path.join(out, 'one-scroll-1920x960.png') });
      await context.close();
    }
  }

  // ---- 3. The student never sees a similarity panel ----
  {
    const flow = { name: 'student', steps: [] }; report.flows.push(flow);
    const { page, context } = await open(VIEWPORTS[0], studentToken, `/student/my-classes`);
    await sleep(4000);
    step(flow, 'no similarity panel or text for the student', await page.evaluate(() => !document.querySelector('app-similarity-report') && !/Match overview|matches other text/.test(document.body.innerText)));
    await context.close();
  }

  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ flows: report.flows, screens: report.screens, failures: report.failures, notes: report.notes }, null, 2));
  worker.stop();
  await browser.close();
  apiServer.close(); site.close();
  await disconnectInMemoryMongo();
  fs.rmSync(uploadRoot, { recursive: true, force: true });
  process.exitCode = report.failures.length ? 1 : 0;
})().catch(error => { console.error(`qa-similarity failed: ${error?.stack || error}`); process.exitCode = 1; });
