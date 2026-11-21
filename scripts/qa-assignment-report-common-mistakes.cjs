'use strict';
// Real-browser QA of the "Common errors" card (sentence examples, "Show 2 more") and the page layout on the assignment report page, against the real backend code in process with an in-memory
// database (like the other qa-*.cjs). Synthetic data only: the shared annotation fixture (a class member and a guest who share three mistake
// types). No AI, email or other network call (any non-local fetch throws).
// Screens, each at 1280, 1100, 900, 390 and 320 px: the card (real report), the card with examples open, both empty states, the partial note,
// long examples, and keyboard focus on "Show examples". The empty, partial and long-example screens replace ONLY the commonMistakes block of
// the real report response (request interception), so the rest of the page is the real one. For each: a screenshot, console errors, failed
// calls, horizontal overflow, and checks on the card's text (no student name in it).
//   node scripts/qa-assignment-report-common-mistakes.cjs [outputDir]   (needs the backend next to this repo, and npm run build:prod)
const fs = require('fs');
const path = require('path');
const BACKEND = path.resolve(__dirname, '../../backend');
const FRONT_PORT = 4420;
Object.assign(process.env, { JWT_SECRET: 'report-common-mistakes-qa', NODE_ENV: 'test', FRONTEND_URL: `http://localhost:${FRONT_PORT}`,
  UPLOAD_BASE_PATH: `uploads/report-common-qa-${process.pid}`, SENSITIVE_RATE_LIMIT_MAX: '100000', AUTH_READ_RATE_LIMIT_MAX: '100000',
  AUTH_WRITE_RATE_LIMIT_MAX: '100000', BASELINE_RATE_LIMIT_MAX: '1000000', SSE_TOKEN_RATE_LIMIT_MAX: '100000', COARSE_IP_RATE_LIMIT_MAX: '1000000' });
const localFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const host = new URL(String(url?.url || url)).hostname;
  if (!['127.0.0.1', 'localhost'].includes(host)) throw new Error(`REAL_NETWORK_CALL_BLOCKED ${host}`);
  return localFetch(url, init);
};

const need = name => require(path.join(BACKEND, name));
const express = need('node_modules/express'), puppeteer = need('node_modules/puppeteer');
const quiet = need('src/utils/logger');
for (const level of ['debug', 'info', 'warn', 'metric', 'error']) if (typeof quiet[level] === 'function') quiet[level] = () => {};
const app = need('src/app');
const { connectInMemoryMongo, disconnectInMemoryMongo } = need('tests/helpers/testServer');
const { seedTestPlans } = need('tests/helpers/seedTestPlans');
const { seedAnnotationFixture } = need('tests/helpers/annotationFixture');
const { signTestJwt } = need('tests/helpers/auth');

const out = path.resolve(process.argv[2] || path.join(__dirname, '../../output/report-common-mistakes-qa'));
const build = path.resolve(__dirname, '../dist/rozna-comarker-fe/browser');
const VIEWPORTS = [{ name: '1280', width: 1280, height: 900 }, { name: '1100', width: 1100, height: 900 }, { name: '900', width: 900, height: 1100 },
  { name: '390', width: 390, height: 844 }, { name: '320', width: 320, height: 700 }];
const report = { screens: [], failures: [], notes: [] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Known and unrelated (CLAUDE.md): the fixture users have no subscription or wallet record; fonts and icons from CDNs are blocked here.
const KNOWN_CALL = /GET \/api\/(subscription\/me|credits\/wallet)[^ ]* 500/;
const KNOWN_CONSOLE = /ERR_FAILED|ERR_BLOCKED|net::|Failed to load resource|fonts\.|googleapis|gstatic|unpkg|boxicons|getMySubscription|wallet/i;
const LONG = 'The students in my class always goes to the library after school because they wants to read more books than befor';
const LONG_WHY = 'The subject is plural, so the verb must agree with it. Read the sentence again and check every verb against its subject.';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const uploadRoot = path.resolve(BACKEND, process.env.UPLOAD_BASE_PATH);
  await connectInMemoryMongo(); await seedTestPlans();
  const fixture = await seedAnnotationFixture({ uploadRoot });
  const teacherToken = signTestJwt({ id: fixture.teacher._id, role: 'teacher', firebaseUid: fixture.teacher.firebaseUid });
  const reportUrl = `/teacher/assignment-report/${fixture.assignment._id}`;
  const NAMES = ['Student', 'Guest Student'];

  const frontend = express();
  frontend.use(express.static(build));
  frontend.get(/.*/, (_req, res) => res.sendFile(path.join(build, 'index.html')));
  const listen = (server, port) => new Promise((resolve, reject) => { const l = server.listen(port, () => resolve(l)); l.on('error', reject); });
  const apiServer = await listen(app, 0), site = await listen(frontend, FRONT_PORT);
  const apiBase = `http://127.0.0.1:${apiServer.address().port}`;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const base = `http://localhost:${FRONT_PORT}`;

  // The real report once, to check it and to build the variants from it.
  const real = await (await localFetch(`${apiBase}/api/assignments/${fixture.assignment._id}/report?tz=UTC`, { headers: { Authorization: `Bearer ${teacherToken}` } })).json();
  report.notes.push(`real report: state ${real.data.commonMistakes.state}, ${real.data.commonMistakes.types.length} types, ${real.data.commonMistakes.totalStudents} students`);
  const variants = {
    real: null,
    notEnough: { basis: 'visible_corrections', totalStudents: 1, minStudents: 2, state: 'not_enough_students', partial: false, types: [] },
    noneShared: { basis: 'visible_corrections', totalStudents: 6, minStudents: 2, state: 'none_shared', partial: false, types: [] },
    partial: { ...real.data.commonMistakes, partial: true },
    long: { ...real.data.commonMistakes, types: ['VF', 'AGR', 'SP', 'ART', 'WC'].map((code, i) => ({ typeCode: code,
      label: ['Verb Form', 'Subject–Verb Agreement', 'Spelling', 'Article Use', 'Word Choice'][i], category: ['GRAMMAR', 'GRAMMAR', 'MECHANICS', 'GRAMMAR', 'VOCABULARY'][i],
      studentCount: 6 - i, totalStudents: 6, occurrenceCount: 12 - i, isCommon: true,
      // Five examples: long, cut sentences with the mistake in the middle (the card shows three and offers "Show 2 more").
      examples: [0, 1, 2, 3, 4].map(k => ({ original: 'goes', corrected: 'go', explanation: LONG_WHY, sentence: { cutStart: true, cutEnd: true,
        parts: [{ text: `${LONG.slice(0, 60 + k)} and the students ` }, { text: 'goes', error: true, corrected: 'go' }, { gap: true }, { text: `${LONG.slice(20, 110)}` }] } })) })) }
  };

  async function open(viewport, variant) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: viewport.width, height: viewport.height });
    await page.evaluateOnNewDocument(jwt => { localStorage.setItem('backend_jwt', jwt); }, teacherToken);
    const seen = { console: [], calls: [] };
    page.on('console', msg => { if (msg.type() === 'error' && !KNOWN_CONSOLE.test(msg.text())) seen.console.push(msg.text().replace(/[a-f0-9]{24}/g, '<id>').slice(0, 220)); });
    page.on('pageerror', error => seen.console.push(`pageerror: ${String(error.message).slice(0, 220)}`));
    await page.setRequestInterception(true);
    page.on('request', async req => {
      const target = new URL(req.url());
      if (target.pathname.startsWith('/api/')) {
        // Only the GET is replaced; the browser's CORS preflight (OPTIONS) goes to the real server.
        if (variant && req.method() === 'GET' && /\/api\/assignments\/[a-f0-9]{24}\/report$/.test(target.pathname)) {
          try {
            const response = await localFetch(`${apiBase}${target.pathname}${target.search}`, { headers: { Authorization: `Bearer ${teacherToken}` } });
            const body = await response.json();
            body.data.commonMistakes = variant;
            // The page calls the API on another origin: the same CORS headers the real server sends.
            const origin = req.headers().origin || base;
            return req.respond({ status: response.status, contentType: 'application/json', body: JSON.stringify(body),
              headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' } });
          } catch (error) {
            seen.console.push(`qa interception failed: ${String(error?.message || error).slice(0, 200)}`);
            return req.continue({ url: `${apiBase}${target.pathname}${target.search}` });
          }
        }
        return req.continue({ url: `${apiBase}${target.pathname}${target.search}` });
      }
      if (['127.0.0.1', 'localhost'].includes(target.hostname) || ['data:', 'blob:'].includes(target.protocol)) return req.continue();
      if (req.resourceType() === 'stylesheet') return req.respond({ status: 200, contentType: 'text/css', body: '' });
      return req.abort();
    });
    page.on('response', res => {
      const target = new URL(res.url());
      const line = `${res.request().method()} ${target.pathname.replace(/[a-f0-9]{24}/g, ':id')} ${res.status()}`;
      if (target.pathname.startsWith('/api/') && res.status() >= 400 && !KNOWN_CALL.test(line)) seen.calls.push(line);
    });
    await page.goto(`${base}${reportUrl}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    return { page, context, seen };
  }
  const waitFor = async (fn, timeout = 30000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return true; await sleep(200); } return false; };
  const visible = (page, selector) => page.evaluate(s => [...document.querySelectorAll(s)].some(e => e.offsetParent !== null), selector);
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
    // The card itself must also fit inside its own panel (the shell can scroll sideways on narrow phones for other reasons).
    const card = document.querySelector('[data-section="common-errors"]');
    const cardOverflow = card ? card.scrollWidth > card.clientWidth + 1 : false;
    return { overflowing: scroll > width + 1, cardOverflow, offenders };
  });
  const cardText = page => page.evaluate(() => (document.querySelector('[data-section="common-errors"]')?.innerText || '').replace(/\s+/g, ' '));
  const scrollToCard = page => page.evaluate(() => document.querySelector('[data-section="common-errors"]')?.scrollIntoView({ block: 'start' }));
  const openFirst = async page => { await page.click('[data-section="common-errors"] button[aria-controls]'); return waitFor(() => page.evaluate(() =>
    document.querySelector('[data-section="common-errors"] button[aria-controls]')?.getAttribute('aria-expanded') === 'true')); };
  // Keyboard only: Tab from the top until the first "Show examples" button has focus (it must be reachable), then capture its focus ring.
  async function tabToToggle(page) {
    await page.evaluate(() => document.activeElement?.blur());
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement?.matches?.('[data-section="common-errors"] button[aria-controls]'))) {
        return page.evaluate(() => { const b = document.activeElement; b.scrollIntoView({ block: 'center' }); const s = getComputedStyle(b);
          return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0; });
      }
    }
    return false;
  }
  const noNames = text => NAMES.every(name => !new RegExp(`(^|[^A-Za-z])${name}([^A-Za-z]|$)`).test(text));

  const SCREENS = [
    { name: 'card-real', variant: null, check: t => /2 of 2 students/.test(t) && /Show examples/.test(t) && noNames(t) },
    { name: 'card-real-examples-open', variant: null, act: openFirst, check: t => /Hide examples/.test(t) && /Student wrote:/i.test(t) && /Corrected:/i.test(t) && noNames(t) },
    { name: 'empty-not-enough-students', variant: variants.notEnough, check: t => /Not enough submissions yet to find common mistakes/.test(t) },
    { name: 'empty-none-shared', variant: variants.noneShared, check: t => /No mistake was shared by 2 or more students\./.test(t) },
    { name: 'partial-note', variant: variants.partial, check: t => /Some edited essays were left out of this section\./.test(t) },
    { name: 'long-examples-open', variant: variants.long, act: openFirst, check: t => /6 of 6 students/.test(t) },
    { name: 'long-examples-show-more', variant: variants.long, act: async page => (await openFirst(page)) && page.evaluate(() => {
      const more = document.querySelector('[data-section="common-errors"] [data-more-examples]'); more?.click(); return Boolean(more); }),
      check: t => /Show fewer examples/.test(t) && /Student wrote:/i.test(t) },
    { name: 'page-full-layout', variant: null, fullPage: true, check: t => /Common errors/.test(t) && noNames(t) },
    { name: 'keyboard-focus-show-examples', variant: null, act: tabToToggle, check: noNames, viewportShot: true }
  ];

  // QA_ONLY=<pattern>: only the screens whose name matches (for a quick re-check).
  const only = process.env.QA_ONLY ? new RegExp(process.env.QA_ONLY) : null;
  for (const screen of SCREENS.filter(s => !only || only.test(s.name))) {
    for (const viewport of VIEWPORTS) {
      const label = `${screen.name}@${viewport.name}`;
      const entry = { screen: screen.name, viewport: viewport.name, ok: false };
      let context;
      try {
        const opened = await open(viewport, screen.variant);
        context = opened.context;
        const page = opened.page;
        entry.ready = await waitFor(() => visible(page, '[data-section="common-errors"]'), 40000);
        if (!entry.ready) {   // what the page shows instead, for the report
          await page.screenshot({ path: path.join(out, `${screen.name}-${viewport.name}-NOT-READY.png`), fullPage: true });
          entry.consoleErrors = opened.seen.console; entry.failedCalls = opened.seen.calls;
          entry.pageText = (await page.evaluate(() => document.body.innerText)).replace(/s+/g, ' ').slice(0, 300);
          throw new Error(`card not found: ${entry.pageText}`);
        }
        if (entry.ready && screen.act) entry.acted = await screen.act(page);
        if (!screen.viewportShot) await scrollToCard(page);
        await sleep(500);
        const file = `${screen.name}-${viewport.name}.png`;
        if (screen.viewportShot) await page.screenshot({ path: path.join(out, file) });
        else {
          // The page scrolls inside an inner container, so a stitched capture misplaces the card and paints the fixed header/nav over it.
          // Instead make the window as tall as the longest scroll area (same width, so the layout breakpoint is unchanged), scroll
          // everything to the top, and cut the card out of one plain capture. Nothing on the page itself is changed.
          const tall = await page.evaluate(() => Math.min(12000, Math.max(innerHeight, ...[document.documentElement, ...document.querySelectorAll('*')]
            .filter(e => e.scrollHeight > e.clientHeight + 1).map(e => e.scrollHeight + (e.getBoundingClientRect().top > 0 ? e.getBoundingClientRect().top : 0)))));
          await page.setViewport({ width: viewport.width, height: Math.ceil(tall) });
          await sleep(400);
          await page.evaluate(() => { scrollTo(0, 0); document.querySelectorAll('*').forEach(e => { if (e.scrollTop) e.scrollTop = 0; }); });
          await sleep(200);
          // page-full-layout: the whole page at this width (two-column rows, callouts, the card, the students table).
          const box = screen.fullPage ? null : await page.evaluate(() => { const r = document.querySelector('[data-section="common-errors"]').getBoundingClientRect();
            return { x: 0, y: Math.max(0, r.top - 12), width: document.documentElement.clientWidth, height: Math.ceil(r.height + 24) }; });
          await page.screenshot({ path: path.join(out, file), ...(box ? { clip: box } : {}) });
        }
        entry.screenshot = file;
        entry.overflow = await overflow(page);
        entry.textCheck = screen.check(await cardText(page));
        entry.consoleErrors = opened.seen.console;
        entry.failedCalls = opened.seen.calls;
        entry.ok = Boolean(entry.ready && (screen.act ? entry.acted : true) && !entry.overflow.cardOverflow && !entry.overflow.overflowing
          && !entry.consoleErrors.length && !entry.failedCalls.length && entry.textCheck);
      } catch (error) {
        entry.error = String(error?.message || error).slice(0, 300);
      } finally {
        await context?.close().catch(() => {});
      }
      report.screens.push(entry);
      if (!entry.ok) report.failures.push(label);
      console.log(`${entry.ok ? 'PASS' : 'FAIL'}  ${label}${entry.ok ? '' : ` :: ${JSON.stringify({ ready: entry.ready, acted: entry.acted, overflow: entry.overflow, console: entry.consoleErrors, calls: entry.failedCalls, text: entry.textCheck, error: entry.error })}`}`);
    }
  }

  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\n${report.screens.length} screenshots in ${out}; ${report.failures.length} failing; notes: ${report.notes.join('; ')}`);
  await browser.close(); apiServer.close(); site.close();
  await disconnectInMemoryMongo();
  fs.rmSync(uploadRoot, { recursive: true, force: true });
  process.exit(report.failures.length ? 1 : 0);
})().catch(error => {
  console.error('qa-assignment-report-common-mistakes failed:', error);
  process.exit(2);
});
