'use strict';
// Real-browser QA of the teacher's student preview (Task 6D) against the real backend code, in-process with an in-memory database:
// the preview must equal the real student page (registered and guest own link), with marks visible and hidden. Synthetic text only.
//   node scripts/qa-student-preview.cjs [outputDir]     (needs backend on annotation-foundation next to this repo, and npm run build:prod)
const fs = require('fs');
const path = require('path');
const BACKEND = path.resolve(__dirname, '../../backend');
const FRONT_PORT = 4399;
Object.assign(process.env, { JWT_SECRET: 'student-preview-qa', NODE_ENV: 'test', GUEST_SUBMISSION_ENABLED: 'true', FRONTEND_URL: `http://localhost:${FRONT_PORT}`,
  UPLOAD_BASE_PATH: `uploads/student-preview-qa-${process.pid}`, SENSITIVE_RATE_LIMIT_MAX: '100000', AUTH_READ_RATE_LIMIT_MAX: '100000', AUTH_WRITE_RATE_LIMIT_MAX: '100000', ANNOTATION_RATE_LIMIT_MAX: '100000' });
const need = name => require(path.join(BACKEND, name));
const express = need('node_modules/express'), puppeteer = need('node_modules/puppeteer');
const quiet = need('src/utils/logger');
for (const level of ['debug', 'info', 'warn', 'metric']) if (typeof quiet[level] === 'function') quiet[level] = () => {};
const app = need('src/app');
const { connectInMemoryMongo, disconnectInMemoryMongo } = need('tests/helpers/testServer');
const { seedTestPlans } = need('tests/helpers/seedTestPlans');
const { signTestJwt } = need('tests/helpers/auth');
const { seedAnnotationFixture, rerunOcr, AI_SPECS, WORDS } = need('tests/helpers/annotationFixture');
const { annotationApi, manualValue } = need('tests/helpers/annotationApi');
const access = need('src/services/guestAccess.service');
const Submission = need('src/models/Submission'), File = need('src/models/File'), Assignment = need('src/models/assignment.model');

const out = path.resolve(process.argv[2] || path.join(__dirname, '../../output/student-preview-qa'));
const uploadRoot = path.resolve(BACKEND, process.env.UPLOAD_BASE_PATH);
const build = path.resolve(__dirname, '../dist/rozna-comarker-fe/browser');
const report = { steps: [], failures: [], consoleErrors: {}, failedCalls: {}, comparisons: {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function check(name, ok, detail) { report.steps.push({ name, ok: Boolean(ok), ...(detail !== undefined ? { detail } : {}) }); if (!ok) report.failures.push(name); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined && !ok ? `  -> ${JSON.stringify(detail).slice(0, 900)}` : ''}`); }
// Text that exists only in hidden, archived or orphaned entries (or AI text replaced by an edit), plus internal identifiers.
const SECRETS = ['before a vowel sound', 'Check the verb', 'Teacher note on realy', 'Missing apostrophe', 'moderationStatus', 'entryId', 'ann_', 'requestHash', 'archivedOrphans', 'teacherAnnotations'];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  await connectInMemoryMongo(); await seedTestPlans();
  const fixture = await seedAnnotationFixture({ uploadRoot });
  for (const [fileId, submissionId, stored] of [[fixture.IDS.fileRegistered, fixture.IDS.registered, '00000000-0000-4000-8000-0000000000f1.png'], [fixture.IDS.fileGuest, fixture.IDS.guest, '00000000-0000-4000-8000-0000000000f2.png']]) {
    fs.renameSync(path.join(uploadRoot, 'submissions', `${fileId}.png`), path.join(uploadRoot, 'submissions', stored));
    await File.updateOne({ _id: fileId }, { $set: { filename: stored, path: `${process.env.UPLOAD_BASE_PATH}/submissions/${stored}`, url: `/uploads/submissions/${stored}` } });
    await Submission.updateOne({ _id: submissionId }, { $set: { fileUrl: `/uploads/submissions/${stored}`, fileUrls: [`/uploads/submissions/${stored}`] } });
  }
  // Hidden, archived, orphan, edited, manual: the same set on both submissions.
  const api = annotationApi(app, fixture.teacher);
  for (const mode of ['registered', 'guest']) {
    const id = fixture.IDS[mode], seeded = mode === 'guest' ? fixture.guest : fixture.registered;
    const rows = (await api.snapshot(id)).body.data.corrections, goes = rows.filter(c => c.quotedText === 'goes').sort((a, b) => a.startChar - b.startChar);
    const ok = res => { if (res.status !== 200) throw new Error(`${mode}: ${res.status} ${res.body.code}`); };
    ok(await api.act(id, { action: 'hide', id: rows.find(c => c.quotedText === 'a').id }));
    ok(await api.act(id, { action: 'archive', id: goes[1].id }));
    ok(await api.act(id, { action: 'edit', id: rows.find(c => c.quotedText === 'dont').id, value: manualValue(seeded, 'dont', { symbol: 'SP', category: 'MECHANICS', message: 'Teacher wording: add the apostrophe.', suggestedText: "don't" }) }));
    ok(await api.act(id, { action: 'edit', id: rows.find(c => c.quotedText === 'realy').id, value: manualValue(seeded, 'realy', { symbol: 'SP', category: 'MECHANICS', message: 'Teacher note on realy.', suggestedText: 'really' }) }));
    ok(await api.act(id, { action: 'add', value: manualValue(seeded, 'park', { symbol: 'WC', category: 'VOCABULARY', message: 'Teacher note: be more specific.', suggestedText: 'playground' }) }));
    await rerunOcr({ submissionId: id, words: WORDS.map(w => (w === 'realy' ? 'really' : w)), specs: AI_SPECS.filter(s => s[0] !== 22), ocrJobId: `job-preview-${mode}` });
    await Submission.updateOne({ _id: id }, { $set: { fileUrl: (await Submission.findById(id).lean()).fileUrl } });
  }
  const frontend = express();
  frontend.use(express.static(build));
  frontend.get(/.*/, (_req, res) => res.sendFile(path.join(build, 'index.html')));
  const listen = (server, port, host) => new Promise((resolve, reject) => { const l = server.listen(port, host, () => resolve(l)); l.on('error', reject); });
  const apiServer = await listen(app, 0, '127.0.0.1'), site = await listen(frontend, FRONT_PORT, '127.0.0.1');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const base = `http://localhost:${FRONT_PORT}`;
  const teacherJwt = signTestJwt({ id: fixture.teacher._id, role: 'teacher', firebaseUid: fixture.teacher.firebaseUid });
  const studentJwt = signTestJwt({ id: fixture.student._id, role: 'student', firebaseUid: fixture.student.firebaseUid });
  const teacherUrl = mode => `${base}/teacher/my-classes/detail/student-submissions/${mode === 'guest' ? 'guest' : fixture.student._id}?classId=${fixture.IDS.class}&assignmentId=${fixture.IDS.assignment}&submissionId=${fixture.IDS[mode]}`;
  const studentUrl = mode => { if (mode === 'guest') { const link = new URL(access.returnUrl(String(fixture.IDS.guest), fixture.guestToken)); return `${base}${link.pathname}${link.hash}`; } return `${base}/student/my-classes/detail/my-submissions/${fixture.IDS.assignment}?classId=${fixture.IDS.class}`; };
  const failPreview = { next: false };

  async function open(label, jwt, url, ready, { width = 1366 } = {}) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width, height: 1000 });
    if (jwt) await page.evaluateOnNewDocument(token => { localStorage.setItem('backend_jwt', token); }, jwt);
    report.consoleErrors[label] = []; report.failedCalls[label] = [];
    const seen = { calls: [], bodies: [] };
    page.on('console', msg => { if (msg.type() === 'error') report.consoleErrors[label].push(msg.text().replace(/[a-f0-9]{24}/g, '<id>').slice(0, 200)); });
    page.on('pageerror', error => report.consoleErrors[label].push(`pageerror: ${String(error.message).slice(0, 200)}`));
    await page.setRequestInterception(true);
    page.on('request', req => {
      const target = new URL(req.url());
      if (target.pathname.startsWith('/api/') || target.pathname.startsWith('/uploads/')) seen.calls.push(`${req.method()} ${target.pathname.replace(/[a-f0-9]{24}/g, ':id')}`);
      if (failPreview.next && target.pathname.endsWith('/teacher-annotations/preview')) { failPreview.next = false; return req.abort(); }
      if (target.pathname.startsWith('/api/') || target.pathname.startsWith('/uploads/')) return req.continue({ url: `http://127.0.0.1:${apiServer.address().port}${target.pathname}${target.search}` });
      if (['127.0.0.1', 'localhost'].includes(target.hostname) || ['data:', 'blob:'].includes(target.protocol)) return req.continue();
      if (req.resourceType() === 'stylesheet') return req.respond({ status: 200, contentType: 'text/css', body: '' });
      return req.abort();
    });
    page.on('response', async res => {
      const target = new URL(res.url());
      if (!target.pathname.startsWith('/api/') && !target.pathname.startsWith('/uploads/')) return;
      if (res.status() >= 400) report.failedCalls[label].push(`${res.request().method()} ${target.pathname.replace(/[a-f0-9]{24}/g, ':id')} ${res.status()}`);
      if (target.pathname.endsWith('/teacher-annotations/preview') && res.status() === 200) seen.bodies.push(await res.text().catch(() => ''));
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector(ready, { timeout: 60000 });
    return { page, context, seen };
  }
  const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`) });

  /**
   * What the page shows, in a comparable form. `scope` is the app-my-submission-page element. Left out: the parts the preview deliberately
   * does not have (PDF, back, draft comparison, practice). Reads both views (image and transcript) and every correction tooltip.
   */
  async function readPage(page, scope, marksVisible) {
    const pick = () => page.evaluate(sel => {
      const root = document.querySelector(sel).cloneNode(true);
      root.querySelectorAll('app-adaptive-writing-studio, app-draft-comparison').forEach(el => el.remove());
      root.querySelectorAll('button').forEach(b => { if (/Download Feedback PDF|Back To|Generating/.test(b.textContent)) b.remove(); });
      return root.textContent.replace(/\s+/g, ' ').trim();
    }, scope);
    await page.waitForFunction((sel, marks) => { const text = document.querySelector(sel)?.textContent || ''; return marks ? /Grammar\s*18/.test(text) : /Marks hidden|hidden by/i.test(text) || /Evaluation/.test(text); }, { timeout: 60000 }, scope, marksVisible);
    await page.waitForFunction(sel => document.querySelectorAll(`${sel} .correction-highlight, ${sel} app-correction-overlay`).length > 0, { timeout: 60000 }, scope);
    await sleep(1500);
    const uploaded = await pick();
    await page.evaluate(sel => [...document.querySelector(sel).querySelectorAll('button')].find(b => /Transcribed Text/.test(b.textContent)).click(), scope);
    await page.waitForSelector(`${scope} app-tokenized-transcript .correction-highlight`, { timeout: 60000 });
    await sleep(1000);
    const transcript = await pick();
    const highlights = await page.$$(`${scope} app-tokenized-transcript .correction-highlight`);
    const words = [], tooltips = [], covered = [];
    for (const h of highlights) {
      words.push(await h.evaluate(el => el.getAttribute('aria-label') || ''));
      await h.hover(); await sleep(200);
      // The tooltip attaches itself to the body. It must really be on top where it is drawn, not merely exist.
      const tip = await page.evaluate(() => { const el = [...document.querySelectorAll('.transcript-tooltip')].find(x => getComputedStyle(x).display !== 'none' && getComputedStyle(x).visibility !== 'hidden');
        if (!el) return null; const r = el.getBoundingClientRect(); const events = el.style.pointerEvents; el.style.pointerEvents = 'auto'; const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); el.style.pointerEvents = events;
        return { text: el.textContent.replace(/[ \t\r\f]+/g, ' ').trim(), onTop: el === top || el.contains(top) }; });
      tooltips.push(tip?.text ?? ''); covered.push(Boolean(tip && !tip.onTop));
    }
    if (highlights.length) { await highlights[highlights.length - 1].hover(); await sleep(250); }
    const stats = {};
    for (const name of ['Content', 'Grammar', 'Organization', 'Vocabulary', 'Mechanics']) { const m = transcript.match(new RegExp(`${name} Issues\\s*([\\d—-]+)`)); stats[name] = m ? m[1] : null; }
    return { uploaded, transcript, words, tooltips, stats, covered };
  }
  function firstDifference(a, b) { let i = 0; while (i < a.length && a[i] === b[i]) i++; return i === a.length && i === b.length ? null : { at: i, student: a.slice(Math.max(0, i - 40), i + 80), preview: b.slice(Math.max(0, i - 40), i + 80) }; }

  async function compare(mode, marksVisible) {
    const name = `${mode}-marks-${marksVisible ? 'visible' : 'hidden'}`;
    const s = await open(`student-${name}`, mode === 'guest' ? null : studentJwt, studentUrl(mode), 'app-my-submission-page');
    const student = await readPage(s.page, 'app-my-submission-page', marksVisible);
    await shot(s.page, `student-${name}`);
    await s.context.close();
    const t = await open(`teacher-${name}`, teacherJwt, teacherUrl(mode), 'app-student-submission-pages');
    await t.page.waitForSelector('[data-preview-open]', { timeout: 60000 });
    await sleep(2000);
    t.seen.calls.length = 0;
    await t.page.click('[data-preview-open]');
    await t.page.waitForSelector('dialog[open] app-my-submission-page', { timeout: 30000 });
    const preview = await readPage(t.page, 'dialog[open] app-my-submission-page', marksVisible);
    await shot(t.page, `preview-${name}`);
    const previewCalls = [...t.seen.calls];
    const domText = await t.page.$eval('dialog[open]', d => d.textContent);
    await t.page.keyboard.press('Escape');
    await sleep(300);
    const closed = await t.page.evaluate(() => !document.querySelector('dialog[open]') && document.activeElement?.hasAttribute('data-preview-open'));
    report.comparisons[name] = { stats: { student: student.stats, preview: preview.stats }, words: student.words.length, tooltips: student.tooltips };
    check(`${name}: uploaded view text equals the student page`, student.uploaded === preview.uploaded, firstDifference(student.uploaded, preview.uploaded));
    check(`${name}: transcript view text and counts equal the student page`, student.transcript === preview.transcript, firstDifference(student.transcript, preview.transcript));
    check(`${name}: same counts`, JSON.stringify(student.stats) === JSON.stringify(preview.stats) && student.stats.Grammar !== null, { student: student.stats, preview: preview.stats });
    check(`${name}: same corrections, same tooltip text`, JSON.stringify([student.words, student.tooltips]) === JSON.stringify([preview.words, preview.tooltips]) && student.words.length > 0, { student: student.tooltips, preview: preview.tooltips });
    check(`${name}: tooltips are really on top inside the preview`, preview.covered.length > 0 && !preview.covered.some(Boolean), preview.covered);
    check(`${name}: visible set is exactly goes, park, dont; the edit and the manual note show`, student.words.length === 3 && student.tooltips.some(x => x.includes('Teacher wording')) && student.tooltips.some(x => x.includes('Teacher note: be more specific')), student.tooltips);
    const leakedDom = SECRETS.filter(x => domText.includes(x)), leakedBody = SECRETS.filter(x => t.seen.bodies.some(b => b.includes(x)) && x !== 'moderationStatus');
    check(`${name}: no teacher-only text in the preview's page or its response`, !leakedDom.length && !leakedBody.length, { leakedDom, leakedBody });
    check(`${name}: previewing issued no writes and no student-endpoint calls`, previewCalls.every(c => /^(GET|OPTIONS) /.test(c)) && !previewCalls.some(c => /reviewed|\/ocr-corrections|\/api\/feedback\/|\/my$|practice|draft-comparison|\/pdf/.test(c)), previewCalls);
    check(`${name}: Esc closes and focus returns to the button`, closed);
    if (!marksVisible) check(`${name}: the marks-hidden notice shows, and no score`, preview.transcript.includes('Marks hidden by teacher') && !/Grammar\s*18/.test(preview.transcript));
    await t.context.close();
  }

  try {
    await compare('registered', true);
    await compare('guest', true);
    await Assignment.updateOne({ _id: fixture.IDS.assignment }, { $set: { showMarksToStudent: false } });
    await compare('registered', false);
    await compare('guest', false);
    await Assignment.updateOne({ _id: fixture.IDS.assignment }, { $set: { showMarksToStudent: true } });

    // Teacher flow: unsaved input, error and retry, saved changes, tablet.
    const t = await open('teacher-flow', teacherJwt, teacherUrl('registered'), 'app-student-submission-pages');
    await t.page.waitForSelector('[data-preview-open]', { timeout: 60000 }); await sleep(2500);
    const editor = 'app-annotation-controls';
    await t.page.evaluate(sel => [...document.querySelector(sel).querySelectorAll('button')].find(b => b.textContent.trim() === 'Open').click(), editor);
    await t.page.waitForSelector(`${editor} [data-counts]`, { timeout: 30000 });
    const row = q => t.page.evaluate((sel, x) => [...document.querySelectorAll(`${sel} [data-row-key]`)].find(r => r.querySelector('blockquote')?.textContent === x)?.getAttribute('data-row-key'), editor, q);
    const click = (key, label) => t.page.evaluate((sel, k, l) => [...[...document.querySelectorAll(`${sel} [data-row-key]`)].find(r => r.getAttribute('data-row-key') === k).querySelectorAll('button')].find(b => b.textContent.trim().startsWith(l)).click(), editor, key, label);
    await click(await row('park'), 'Edit'); await t.page.waitForSelector(`${editor} form`);
    await t.page.click(`${editor} #annotation-message`, { count: 3 }); await t.page.keyboard.press('Backspace'); await t.page.type(`${editor} #annotation-message`, 'Typed but not saved.');
    const before = [...t.seen.calls].length;
    await t.page.click('[data-preview-open]');
    await t.page.waitForSelector('dialog[open] app-my-submission-page', { timeout: 30000 }); await sleep(2000);
    await shot(t.page, 'unsaved-notice');
    const unsavedText = await t.page.$eval('dialog[open]', d => d.textContent);
    check('unsaved input: notice shown, the unsaved text is not in the preview, nothing is saved', unsavedText.includes('Unsaved changes are not included') && !unsavedText.includes('Typed but not saved.') && t.seen.calls.slice(before).every(c => /^(GET|OPTIONS) /.test(c)));
    await t.page.click('[data-preview-close]'); await sleep(300);
    check('closing keeps the editor\'s text and the unsaved protection', await t.page.$eval(`${editor} #annotation-message`, el => el.value === 'Typed but not saved.'));
    // Save, then the preview shows the saved text.
    await t.page.evaluate(sel => document.querySelector(`${sel} form button[type=submit]`).click(), editor);
    await t.page.waitForFunction(sel => document.querySelector(sel).innerText.includes('Your edit is saved.'), { timeout: 20000 }, editor); await sleep(800);
    await t.page.click('[data-preview-open]');
    await t.page.waitForSelector('dialog[open] app-my-submission-page app-tokenized-transcript, dialog[open] app-my-submission-page app-correction-overlay', { timeout: 30000 }); await sleep(800);
    const noNotice = await t.page.$eval('dialog[open]', d => !d.textContent.includes('Unsaved changes are not included'));
    await t.page.evaluate(() => [...document.querySelector('dialog[open] app-my-submission-page').querySelectorAll('button')].find(b => /Transcribed Text/.test(b.textContent)).click());
    await t.page.waitForSelector('dialog[open] app-tokenized-transcript .correction-highlight'); await sleep(500);
    const labels = await t.page.$$('dialog[open] app-tokenized-transcript .correction-highlight'); const texts = [];
    for (const h of labels) { await h.hover(); await sleep(150); texts.push(await t.page.evaluate(() => [...document.querySelectorAll('.transcript-tooltip')].find(x => getComputedStyle(x).display !== 'none')?.textContent || '')); }
    check('after a save: the preview shows the saved text and no unsaved notice', noNotice && texts.some(x => x.includes('Typed but not saved.')), texts);
    await t.page.click('[data-preview-close]'); await sleep(200);
    // Error, then Retry.
    failPreview.next = true;
    await t.page.click('[data-preview-open]');
    await t.page.waitForSelector('dialog[open] [data-preview-error]', { timeout: 20000 });
    await shot(t.page, 'error-retry');
    await t.page.evaluate(() => document.querySelector('dialog[open] [data-preview-error] button').click());
    await t.page.waitForSelector('dialog[open] app-my-submission-page', { timeout: 30000 });
    check('error state with Retry; Retry loads the preview', true);
    await t.page.click('[data-preview-close]');
    await t.context.close();

    const tablet = await open('teacher-tablet', teacherJwt, teacherUrl('registered'), 'app-student-submission-pages', { width: 820 });
    await tablet.page.waitForSelector('[data-preview-open]', { timeout: 60000 }); await sleep(2000);
    await tablet.page.click('[data-preview-open]');
    await tablet.page.waitForSelector('dialog[open] app-my-submission-page', { timeout: 30000 }); await sleep(2000);
    await shot(tablet.page, 'tablet');
    check('tablet width: the preview fits, with no sideways overflow of the dialog', await tablet.page.$eval('dialog[open]', d => d.scrollWidth <= d.clientWidth + 1));
    await tablet.context.close();
  } catch (error) {
    report.failures.push(`aborted: ${error.message}`);
    console.error('ABORTED', error);
    for (const ctx of browser.browserContexts()) for (const page of await ctx.pages().catch(() => [])) { const text = await page.evaluate(() => (document.querySelector('dialog[open]') || document.body).textContent.replace(/s+/g, ' ').slice(0, 1500)).catch(() => ''); console.error('PAGE', page.url().slice(0, 80), text); await page.screenshot({ path: path.join(out, `abort-${Date.now()}.png`) }).catch(() => {}); }
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`\n${report.steps.filter(s => s.ok).length} passed, ${report.failures.length} failed`);
    console.log('failed calls:', JSON.stringify([...new Set(Object.values(report.failedCalls).flat())], null, 1));
    console.log('console errors:', JSON.stringify([...new Set(Object.values(report.consoleErrors).flat())], null, 1));
    await browser.close(); apiServer.close(); site.close(); await disconnectInMemoryMongo();
    fs.rmSync(uploadRoot, { recursive: true, force: true });
    process.exit(report.failures.length ? 1 : 0);
  }
})();
