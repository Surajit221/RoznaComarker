'use strict';
// Real-browser QA of the teacher annotation editor (Task 6B) against the real 6A backend code, in-process with an in-memory database.
// Needs the backend checked out next to this repo on annotation-foundation, and a production build in dist/ (npm run build:prod).
//   node scripts/qa-annotation-editor.cjs [outputDir]
//   QA_LIMITS=1 node scripts/qa-annotation-editor.cjs [outputDir]     (offline retry, lost response, 429 with a low limit, 404)
// Synthetic text only. Nothing here touches a real database. Writes report.json and screenshots to outputDir.
const fs = require('fs');
const path = require('path');
const BACKEND = path.resolve(__dirname, '../../backend');
const FRONT_PORT = 4398;
const LIMITS = process.env.QA_LIMITS === '1';
Object.assign(process.env, { JWT_SECRET: 'annotation-editor-qa', NODE_ENV: 'test', GUEST_SUBMISSION_ENABLED: 'true', FRONTEND_URL: `http://localhost:${FRONT_PORT}`,
  UPLOAD_BASE_PATH: `uploads/annotation-editor-qa-${process.pid}`, SENSITIVE_RATE_LIMIT_MAX: '100000', AUTH_READ_RATE_LIMIT_MAX: '100000', AUTH_WRITE_RATE_LIMIT_MAX: '100000', ANNOTATION_RATE_LIMIT_MAX: LIMITS ? '3' : '100000', ...(LIMITS ? { ANNOTATION_RATE_LIMIT_WINDOW_MS: '20000' } : {}) });
const need = name => require(path.join(BACKEND, name));
const express = need('node_modules/express'), puppeteer = need('node_modules/puppeteer');
const quiet = need('src/utils/logger');
for (const level of ['debug', 'info', 'warn', 'metric']) if (typeof quiet[level] === 'function') quiet[level] = () => {};
const app = need('src/app');
const { connectInMemoryMongo, disconnectInMemoryMongo } = need('tests/helpers/testServer');
const { seedTestPlans } = need('tests/helpers/seedTestPlans');
const { signTestJwt } = need('tests/helpers/auth');
const { seedAnnotationFixture, rerunOcr, AI_SPECS, WORDS } = need('tests/helpers/annotationFixture');
const access = need('src/services/guestAccess.service');
const Submission = need('src/models/Submission'), File = need('src/models/File'), Class = need('src/models/class.model');

const out = path.resolve(process.argv[2] || path.join(__dirname, LIMITS ? '../../output/annotation-editor-qa-limits' : '../../output/annotation-editor-qa'));
const uploadRoot = path.resolve(BACKEND, process.env.UPLOAD_BASE_PATH);
const build = path.resolve(__dirname, '../dist/rozna-comarker-fe/browser');
const report = { steps: [], failures: [], consoleErrors: {}, failedCalls: {}, timings: {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function check(name, ok, detail) { report.steps.push({ name, ok: Boolean(ok), ...(detail !== undefined ? { detail } : {}) }); if (!ok) report.failures.push(name); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined && !ok ? `  -> ${JSON.stringify(detail)}` : ''}`); }

(async () => {
  fs.mkdirSync(out, { recursive: true });
  await connectInMemoryMongo(); await seedTestPlans();
  const fixture = await seedAnnotationFixture({ uploadRoot });
  // The server only serves UUID-named stored files; the shared fixture's names are not.
  for (const [fileId, submissionId, stored] of [[fixture.IDS.fileRegistered, fixture.IDS.registered, '00000000-0000-4000-8000-0000000000f1.png'], [fixture.IDS.fileGuest, fixture.IDS.guest, '00000000-0000-4000-8000-0000000000f2.png']]) {
    fs.renameSync(path.join(uploadRoot, 'submissions', `${fileId}.png`), path.join(uploadRoot, 'submissions', stored));
    await File.updateOne({ _id: fileId }, { $set: { filename: stored, path: `${path.basename(uploadRoot)}/submissions/${stored}`, url: `/uploads/submissions/${stored}` } });
    await Submission.updateOne({ _id: submissionId }, { $set: { fileUrl: `/uploads/submissions/${stored}`, fileUrls: [`/uploads/submissions/${stored}`] } });
  }
  const frontend = express();
  frontend.use(express.static(build));
  frontend.get(/.*/, (_req, res) => res.sendFile(path.join(build, 'index.html')));
  const listen = (server, port, host) => new Promise((resolve, reject) => { const l = server.listen(port, host, () => resolve(l)); l.on('error', reject); });
  const api = await listen(app, 0, '127.0.0.1'), site = await listen(frontend, FRONT_PORT, '127.0.0.1');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const base = `http://localhost:${FRONT_PORT}`;
  const teacherJwt = signTestJwt({ id: fixture.teacher._id, role: 'teacher', firebaseUid: fixture.teacher.firebaseUid });
  const studentJwt = signTestJwt({ id: fixture.student._id, role: 'student', firebaseUid: fixture.student.firebaseUid });
  const teacherUrl = mode => `${base}/teacher/my-classes/detail/student-submissions/${mode === 'guest' ? 'guest' : fixture.student._id}?classId=${fixture.IDS.class}&assignmentId=${fixture.IDS.assignment}&submissionId=${fixture.IDS[mode]}`;
  const newRelease = { on: false };

  async function open(label, jwt, url, ready, { width = 1366 } = {}) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width, height: 1000 });
    if (jwt) await page.evaluateOnNewDocument(token => { localStorage.setItem('backend_jwt', token); }, jwt);
    report.consoleErrors[label] = []; report.failedCalls[label] = [];
    const seen = { dialogs: [], stats: {}, posts: [], replies: [], loseNextResponse: false };
    page.on('console', msg => { if (msg.type() === 'error') report.consoleErrors[label].push(msg.text().replace(/[a-f0-9]{24}/g, '<id>').slice(0, 200)); });
    page.on('pageerror', error => report.consoleErrors[label].push(`pageerror: ${String(error.message).slice(0, 200)}`));
    page.on('dialog', async dialog => { seen.dialogs.push(dialog.type()); if (seen.onDialog) await seen.onDialog(dialog); else await dialog.dismiss(); });
    await page.setRequestInterception(true);
    page.on('request', req => {
      const target = new URL(req.url());
      if (req.method() === 'POST' && target.pathname.endsWith('/teacher-annotations')) {
        seen.posts.push(JSON.parse(req.postData()));
        // The server applies the change, but the browser never gets the answer.
        if (seen.loseNextResponse) { seen.loseNextResponse = false;
          return fetch(`http://127.0.0.1:${api.address().port}${target.pathname}`, { method: 'POST', headers: { authorization: req.headers().authorization, 'content-type': 'application/json' }, body: req.postData() })
            .then(() => req.abort()); }
      }
      if (target.pathname.endsWith('/version.json') && newRelease.on) return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ releaseId: 'f'.repeat(24) }) });
      if (target.pathname.startsWith('/api/') || target.pathname.startsWith('/uploads/')) return req.continue({ url: `http://127.0.0.1:${api.address().port}${target.pathname}${target.search}` });
      if (['127.0.0.1', 'localhost'].includes(target.hostname) || ['data:', 'blob:'].includes(target.protocol)) return req.continue();
      if (req.resourceType() === 'stylesheet') return req.respond({ status: 200, contentType: 'text/css', body: '' });
      return req.abort();
    });
    page.on('response', async res => {
      const target = new URL(res.url());
      if (!target.pathname.startsWith('/api/') && !target.pathname.startsWith('/uploads/')) return;
      const key = `${res.request().method()} ${target.pathname.replace(/[a-f0-9]{24}/g, ':id')}`;
      if (res.status() >= 400) report.failedCalls[label].push(`${key} ${res.status()}`);
      if (res.request().method() === 'POST' && target.pathname.endsWith('/teacher-annotations')) seen.replies.push({ status: res.status(), body: await res.json().catch(() => null) });
      if (res.status() === 200 && /ocr-corrections$/.test(target.pathname)) { const body = await res.json().catch(() => null); if (body?.data) seen.stats = { statistics: body.data.statistics, corrections: body.data.corrections }; }
    });
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) (report.navigations ??= []).push(`${label}: ${frame.url().replace(/[a-f0-9]{24}/g, '<id>').slice(0, 120)}`); });
    const cdp = await page.createCDPSession(); await cdp.send('Page.enable');
    cdp.on('Page.frameRequestedNavigation', e => (report.navigationReasons ??= []).push(`${label}: ${e.reason} ${e.disposition} ${String(e.url).slice(0, 100)}`));
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector(ready, { timeout: 60000 });
    return { page, context, seen };
  }
  // Viewport shots: a full-page shot resizes the viewport, which can cross the layout breakpoint and rebuild the page.
  const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`) });
  const editor = 'app-annotation-controls';
  async function openEditor(page) {
    await page.waitForSelector(editor, { timeout: 60000 });
    await page.waitForFunction(() => /Grammar\s+18/.test(document.body.innerText), { timeout: 60000 });
    await page.evaluate(sel => [...document.querySelector(sel).querySelectorAll('button')].find(b => b.textContent.trim() === 'Open').click(), editor);
    await page.waitForSelector(`${editor} [data-counts]`, { timeout: 60000 });
    await page.evaluate(sel => document.querySelector(sel).scrollIntoView(), editor);
  }
  const counts = page => page.$eval(`${editor} [data-counts]`, el => el.textContent.replace(/\s+/g, ' ').trim());
  const editorText = page => page.$eval(editor, el => el.innerText.replace(/\s+/g, ' '));
  const rowKey = (page, quote, nth = 0) => page.evaluate((sel, q, n) => [...document.querySelectorAll(`${sel} [data-row-key]`)].filter(r => r.querySelector('blockquote')?.textContent === q)[n]?.getAttribute('data-row-key'), editor, quote, nth);
  async function clickIn(page, key, label) {
    return page.evaluate((sel, k, l) => { const row = [...document.querySelectorAll(`${sel} [data-row-key]`)].find(r => r.getAttribute('data-row-key') === k); const button = [...row.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(l)); button.click(); return true; }, editor, key, label);
  }
  const clickButton = (page, label) => page.evaluate((sel, l) => [...document.querySelector(sel).querySelectorAll('button')].find(b => b.textContent.trim().startsWith(l)).click(), editor, label);
  const waitNotice = (page, text) => page.waitForFunction((sel, t) => document.querySelector(sel).innerText.includes(t), { timeout: 20000 }, editor, text);
  async function selectInForm(page, word) {
    await page.evaluate((sel, w) => { const ta = document.querySelector(`${sel} [data-source-text]`); const at = (' ' + ta.value + ' ').indexOf(` ${w} `); ta.focus(); ta.setSelectionRange(at, at + w.length); ta.dispatchEvent(new Event('select', { bubbles: true })); }, editor, word);
  }
  async function fillForm(page, { symbol, message, suggestion }) {
    if (symbol) await page.select(`${editor} #annotation-symbol`, symbol);
    for (const [id, value] of [['annotation-message', message], ['annotation-suggestion', suggestion]]) {
      if (value === undefined) continue;
      await page.click(`${editor} #${id}`, { count: 3 }); await page.keyboard.press('Backspace'); await page.type(`${editor} #${id}`, value);
    }
  }
  const save = page => page.evaluate(sel => document.querySelector(`${sel} form button[type=submit]`).click(), editor);

  try {
    if (LIMITS) {
      const t = await open('teacher-limits', teacherJwt, teacherUrl('registered'), 'app-student-submission-pages');
      await openEditor(t.page);
      // Offline: the request never leaves; Retry after reconnecting sends the same request id.
      let key = await rowKey(t.page, 'a');
      await t.page.setOfflineMode(true);
      await clickIn(t.page, key, 'Hide');
      await waitNotice(t.page, 'could not confirm');
      await shot(t.page, '20-offline');
      await t.page.setOfflineMode(false);
      await clickButton(t.page, 'Retry'); await waitNotice(t.page, 'Hidden from the student.'); await sleep(300);
      check('offline: plain message, Retry re-sends the same request id, applied once', t.seen.posts.length === 2 && t.seen.posts[0].requestId === t.seen.posts[1].requestId && (await counts(t.page)).includes('4 of 5'), t.seen.posts.map(p => p.requestId));
      // The server applied it but the answer was lost: Retry must not apply twice.
      t.seen.posts.length = 0; t.seen.replies.length = 0;
      key = await rowKey(t.page, 'dont');
      t.seen.loseNextResponse = true;
      await clickIn(t.page, key, 'Hide');
      await waitNotice(t.page, 'could not confirm');
      await clickButton(t.page, 'Retry'); await waitNotice(t.page, 'Hidden from the student.'); await sleep(300);
      check('lost response: Retry uses the same request id and the server replays instead of applying twice',
        t.seen.posts.length === 2 && t.seen.posts[0].requestId === t.seen.posts[1].requestId && t.seen.replies.at(-1)?.body?.data?.replay === true && (await counts(t.page)).includes('3 of 5'), t.seen.replies);
      // 429: toggle until the low limit (3 per 20 s) is hit; the request is kept and Retry succeeds after the window.
      t.seen.posts.length = 0;
      key = await rowKey(t.page, 'realy');
      let limited = false;
      for (let i = 0; i < 8 && !limited; i++) {
        await clickIn(t.page, key, i % 2 ? 'Restore' : 'Hide');
        await t.page.waitForFunction(sel => { const x = document.querySelector(sel).innerText; return x.includes('Wait a few minutes') || x.includes('Hidden from the student.') || x.includes('Restored.'); }, { timeout: 20000 }, editor);
        limited = (await editorText(t.page)).includes('Wait a few minutes');
        if (!limited) await sleep(250);
      }
      await shot(t.page, '21-rate-limited');
      check('429: friendly wait message, Retry offered', limited && (await editorText(t.page)).includes('Retry'), t.seen.replies.map(r => r.status));
      const limitedId = t.seen.posts.at(-1).requestId;
      await sleep(21000);
      await clickButton(t.page, 'Retry');
      await t.page.waitForFunction(sel => { const x = document.querySelector(sel).innerText; return x.includes('Hidden from the student.') || x.includes('Restored.'); }, { timeout: 20000 }, editor);
      check('429: after the window, Retry succeeds with the same request id', t.seen.posts.at(-1).requestId === limitedId && t.seen.replies.at(-1)?.status === 200, t.seen.replies.at(-1));
      // 404: access lost while the editor is open.
      await Class.updateOne({ _id: fixture.IDS.class }, { $set: { isActive: false } });
      await clickIn(t.page, await rowKey(t.page, 'goes'), 'Hide');
      await waitNotice(t.page, 'do not have access'); await sleep(200);
      await shot(t.page, '22-not-found');
      check('404: "not found or no access", all actions gone', (await t.page.$$eval(`${editor} [data-row-key] button`, b => b.length)) === 0, t.seen.replies.at(-1));
      return;
    }

    // 1. Teacher: every action on the registered submission.
    const t = await open('teacher', teacherJwt, teacherUrl('registered'), 'app-student-submission-pages');
    await openEditor(t.page);
    await shot(t.page, '01-teacher-list');
    check('list shows all five, all visible', (await counts(t.page)).includes('5 of 5 corrections are visible'), await counts(t.page));

    let key = await rowKey(t.page, 'a');
    await clickIn(t.page, key, 'Hide'); await waitNotice(t.page, 'Hidden from the student.'); await t.page.waitForFunction(sel => document.querySelector(`${sel} [data-counts]`).textContent.includes('4 of 5'), {}, editor);
    await shot(t.page, '02-hidden');
    check('hide: count drops; the row stays, dimmed, with its badge', await t.page.evaluate((sel, k) => { const r = document.querySelector(`${sel} [data-row-key="${k}"]`); return r.classList.contains('row--dimmed') && r.innerText.includes('Hidden from student'); }, editor, key));
    await clickIn(t.page, key, 'Restore'); await waitNotice(t.page, 'Restored'); await t.page.waitForFunction(sel => document.querySelector(`${sel} [data-counts]`).textContent.includes('5 of 5'), {}, editor);
    check('restore: count returns', true);
    // Keyboard only: focus the button, press Enter; focus lands back on the row.
    await t.page.evaluate((sel, k) => [...document.querySelector(`${sel} [data-row-key="${k}"]`).querySelectorAll('button')].find(b => b.textContent.trim().startsWith('Hide')).focus(), editor, key);
    await t.page.keyboard.press('Enter'); await waitNotice(t.page, 'Hidden from the student.'); await t.page.waitForFunction(sel => document.querySelector(`${sel} [data-counts]`).textContent.includes('4 of 5'), {}, editor);
    await sleep(300);
    check('keyboard: Enter on Hide works and focus returns to the row', await t.page.evaluate(k => document.activeElement?.getAttribute('data-row-key') === k, key));

    key = await rowKey(t.page, 'goes', 1);
    await clickIn(t.page, key, 'Remove');
    await t.page.waitForSelector(`${editor} dialog[open]`);
    await shot(t.page, '03-remove-confirm');
    check('remove asks first and says it is restorable and recorded', await t.page.$eval(`${editor} dialog`, d => d.innerText.includes('restore it at any time') && d.innerText.includes('recorded')));
    await t.page.evaluate(sel => [...document.querySelector(`${sel} dialog`).querySelectorAll('button')].find(b => b.textContent.trim() === 'Remove').click(), editor);
    await waitNotice(t.page, 'Removed. You can restore'); await sleep(200);
    check('remove: the row stays marked Removed', (await t.page.$eval(`${editor} [data-row-key="${key}"]`, r => r.innerText)).includes('Removed'));

    key = await rowKey(t.page, 'dont');
    await clickIn(t.page, key, 'Edit'); await t.page.waitForSelector(`${editor} form`);
    await fillForm(t.page, { message: 'Teacher wording: add the apostrophe.' });
    await shot(t.page, '04-edit-form');
    await save(t.page); await waitNotice(t.page, 'Your edit is saved.'); await sleep(200);
    check('edit: saved, marked Edited by you', (await t.page.$eval(`${editor} [data-row-key="${key}"]`, r => r.innerText)).includes('Edited by you') && (await editorText(t.page)).includes('Teacher wording: add the apostrophe.'));

    // A hidden entry that was edited: the teacher still sees the edit; restored again for the student checks below.
    await clickIn(t.page, key, 'Hide'); await waitNotice(t.page, 'Hidden from the student.'); await sleep(300);
    const hiddenEdited = await t.page.$eval(`${editor} [data-row-key="${key}"]`, r => r.innerText);
    await shot(t.page, '04b-hidden-edited');
    check('hidden + edited: the teacher sees the edited text, the Edited and Hidden badges', hiddenEdited.includes('Teacher wording: add the apostrophe.') && hiddenEdited.includes('Edited by you') && hiddenEdited.includes('Hidden from student') && !hiddenEdited.includes('Missing apostrophe'), hiddenEdited);
    await clickIn(t.page, key, 'Restore'); await waitNotice(t.page, 'Restored'); await sleep(300);

    await clickButton(t.page, 'Add correction'); await t.page.waitForSelector(`${editor} form`);
    await selectInForm(t.page, 'park'); await fillForm(t.page, { symbol: 'WC', message: 'Teacher note: be more specific.', suggestion: 'playground' });
    await save(t.page); await waitNotice(t.page, 'Your correction is added.'); await sleep(200);
    check('add: manual correction listed with the Teacher badge', (await editorText(t.page)).includes('Teacher note: be more specific.') && (await t.page.$eval(`${editor} [data-row-key="${await rowKey(t.page, 'park')}"]`, r => r.innerText)).includes('Teacher'));

    // History, with its real rows.
    await clickButton(t.page, 'Change history'); await t.page.waitForFunction(sel => document.querySelector(`${sel} .history`)?.innerText.includes('Added'), {}, editor);
    await t.page.evaluate(sel => document.querySelector(`${sel} .history`).scrollIntoView(), editor);
    await shot(t.page, '05-history');
    check('history shows real rows, no invalid dates', !(await t.page.$eval(`${editor} .history`, h => h.innerText)).includes('Invalid'));
    await clickButton(t.page, 'Change history');

    // 2. Orphans: real OCR re-run ("realy" and "home" change). One edit and one manual entry lose their text.
    key = await rowKey(t.page, 'realy');
    await clickIn(t.page, key, 'Edit'); await t.page.waitForSelector(`${editor} form`); await fillForm(t.page, { message: 'Teacher note on realy.' });
    await save(t.page); await waitNotice(t.page, 'Your edit is saved.'); await sleep(300);
    await clickButton(t.page, 'Add correction'); await t.page.waitForSelector(`${editor} form`);
    await selectInForm(t.page, 'home'); await fillForm(t.page, { symbol: 'WC', message: 'Teacher note on home.', suggestion: 'house' });
    await save(t.page); await waitNotice(t.page, 'Your correction is added.'); await sleep(300);
    const newWords = WORDS.map(w => (w === 'realy' ? 'really' : w === 'home' ? 'house' : w));
    await rerunOcr({ submissionId: fixture.IDS.registered, words: newWords, specs: AI_SPECS.filter(s => s[0] !== 22), ocrJobId: 'job-qa-rerun' });
    await clickButton(t.page, 'Reload latest'); await t.page.waitForFunction(sel => document.querySelector(`${sel}`).innerText.includes('Needs review'), { timeout: 20000 }, editor);
    await t.page.evaluate(sel => [...document.querySelector(sel).querySelectorAll('.filter')].find(b => b.textContent.includes('Needs review')).click(), editor);
    await sleep(200);
    await shot(t.page, '06-orphans');
    const orphanText = await editorText(t.page);
    check('orphans listed with the reason in plain words', orphanText.includes('no longer in the transcript') && orphanText.includes('Needs review') && !orphanText.includes('TEXT_NOT_FOUND'));
    check('the student-visible count excludes orphans', !(await counts(t.page)).includes('Needs review: 0'), await counts(t.page));
    const orphanKeys = await t.page.$$eval(`${editor} [data-row-key]`, rows => rows.map(r => ({ key: r.getAttribute('data-row-key'), quote: r.querySelector('blockquote')?.textContent })));
    const realyOrphan = orphanKeys.find(o => o.quote === 'realy'), homeOrphan = orphanKeys.find(o => o.quote === 'home');
    await clickIn(t.page, homeOrphan.key, 'Remove'); await t.page.waitForSelector(`${editor} dialog[open]`);
    await t.page.evaluate(sel => [...document.querySelector(`${sel} dialog`).querySelectorAll('button')].find(b => b.textContent.trim() === 'Remove').click(), editor);
    await waitNotice(t.page, 'Removed. You can restore'); await sleep(300);
    const filterTo = async label => { await t.page.evaluate((sel, l) => [...document.querySelector(sel).querySelectorAll('.filter')].find(b => b.textContent.startsWith(l)).click(), editor, label); await sleep(200); };
    await filterTo('Removed');
    await shot(t.page, '06b-archived-orphan-in-removed');
    const archivedOrphanRow = await t.page.$eval(`${editor} [data-row-key="${homeOrphan.key}"]`, r => r.innerText);
    check('archived orphan: listed under Removed, no longer counted as needing review', archivedOrphanRow.includes('Removed') && !archivedOrphanRow.includes('Needs review:') && (await counts(t.page)).includes('Needs review: 1'), await counts(t.page));
    await clickIn(t.page, homeOrphan.key, 'Restore'); await waitNotice(t.page, 'Back in Needs review'); await sleep(300);
    await filterTo('Needs review');
    check('archived orphan restored: back under Needs review, the visible count unchanged', (await t.page.$eval(`${editor} [data-row-key="${homeOrphan.key}"]`, r => r.innerText)).includes('Needs review') && (await counts(t.page)).includes('Needs review: 2'), await counts(t.page));
    await clickIn(t.page, realyOrphan.key, 'Place again'); await t.page.waitForSelector(`${editor} form`);
    check('placing an orphan again keeps its text and asks for a new selection', await t.page.$eval(`${editor} #annotation-message`, el => el.value === 'Teacher note on realy.') && (await editorText(t.page)).includes('nothing yet'));
    await selectInForm(t.page, 'really'); await save(t.page); await waitNotice(t.page, 'Your edit is saved.'); await sleep(300);
    await t.page.evaluate(sel => [...document.querySelector(sel).querySelectorAll('.filter')].find(b => b.textContent.startsWith('All')).click(), editor);
    await sleep(200);
    await shot(t.page, '07-after-orphans');
    check('orphan placed again: now a visible Teacher correction', (await editorText(t.page)).includes('Teacher note on realy.'), await counts(t.page));
    report.teacherFinalCounts = await counts(t.page);

    // 3. Registered student: only the visible set, updated counts.
    const s = await open('student-registered', studentJwt, `${base}/student/my-classes/detail/my-submissions/${fixture.IDS.assignment}?classId=${fixture.IDS.class}`, 'app-my-submission-page');
    await s.page.waitForFunction(() => /Grammar\s+18/.test(document.body.innerText), { timeout: 60000 }); await sleep(2000);
    await shot(s.page, '08-student-registered');
    const seen = s.seen.stats.corrections || [];
    report.studentRegistered = { statistics: s.seen.stats.statistics, quotes: seen.map(c => c.quotedText) };
    check('registered student: hidden, removed and orphan text absent; edited and manual text present',
      !seen.some(c => /vowel sound|Check the verb|Teacher note on home/.test(c.message)) && seen.some(c => c.message === 'Teacher wording: add the apostrophe.') && seen.some(c => c.message === 'Teacher note: be more specific.'), report.studentRegistered);
    check('registered student: count equals the teacher\'s "visible to the student" number', (report.teacherFinalCounts || '').startsWith(`${s.seen.stats.statistics?.total} of`), { teacher: report.teacherFinalCounts, student: s.seen.stats.statistics });
    check('registered student: scores unchanged', /Grammar\s+18/.test(await s.page.evaluate(() => document.body.innerText)));
    await s.context.close();

    // 4. Guest submission: hide through the editor, then the student's own link.
    const tg = await open('teacher-guest', teacherJwt, teacherUrl('guest'), 'app-student-submission-pages');
    await openEditor(tg.page);
    await clickIn(tg.page, await rowKey(tg.page, 'a'), 'Hide'); await waitNotice(tg.page, 'Hidden from the student.'); await sleep(300);
    await tg.context.close();
    const link = new URL(access.returnUrl(String(fixture.IDS.guest), fixture.guestToken));
    const g = await open('student-guest', null, `${base}${link.pathname}${link.hash}`, 'app-my-submission-page');
    await g.page.waitForFunction(() => /Grammar\s+18/.test(document.body.innerText), { timeout: 60000 }); await sleep(2000);
    await shot(g.page, '09-student-guest-own-link');
    report.studentGuest = { statistics: g.seen.stats.statistics, quotes: (g.seen.stats.corrections || []).map(c => c.quotedText) };
    check('guest own link: visible set and counts follow the hide', g.seen.stats.statistics?.total === 4 && !(g.seen.stats.corrections || []).some(c => c.quotedText === 'a'), report.studentGuest);
    await g.context.close();

    // 5. Two tabs: the stale tab gets the 409 flow and keeps its text.
    const tabB = await open('teacher-tab-b', teacherJwt, teacherUrl('registered'), 'app-student-submission-pages');
    await openEditor(tabB.page);
    const goesB = await rowKey(tabB.page, 'goes');
    await clickIn(tabB.page, goesB, 'Edit'); await tabB.page.waitForSelector(`${editor} form`);
    await fillForm(tabB.page, { message: 'Text typed in tab B.' });
    await t.page.bringToFront(); await clickIn(t.page, await rowKey(t.page, 'goes'), 'Hide'); await waitNotice(t.page, 'Hidden from the student.'); await sleep(300);
    await tabB.page.bringToFront(); await save(tabB.page);
    await tabB.page.waitForFunction(sel => document.querySelector(sel).innerText.includes('Your change was not saved'), { timeout: 20000 }, editor); await sleep(400);
    await tabB.page.evaluate(sel => document.querySelector(sel).scrollIntoView(), editor);
    await shot(tabB.page, '10-two-tab-conflict');
    check('two tabs: 409 shown in plain words, the typed text kept, the latest list loaded',
      await tabB.page.$eval(`${editor} #annotation-message`, el => el.value === 'Text typed in tab B.') && (await counts(tabB.page)) === (await counts(t.page)), { b: await counts(tabB.page), a: await counts(t.page) });
    check('two tabs: the 409 is the only failed call in that tab', report.failedCalls['teacher-tab-b'].filter(c => c.includes('teacher-annotations')).join() === 'POST /api/submissions/:id/teacher-annotations 409', report.failedCalls['teacher-tab-b']);
    await tabB.seen; await clickButton(tabB.page, 'Cancel'); await sleep(100);
    await tabB.context.close();
    await t.page.bringToFront(); await clickIn(t.page, await rowKey(t.page, 'goes'), 'Restore'); await waitNotice(t.page, 'Restored'); await sleep(300);

    // 6. A new release while the form is dirty and unfocused: no reload, the banner says so.
    await t.page.evaluate(() => { window.__sameDocument = true; });
    key = await rowKey(t.page, 'goes');
    await clickIn(t.page, key, 'Edit'); await t.page.waitForSelector(`${editor} form`);
    await fillForm(t.page, { message: 'Unsaved text during a release.' });
    await t.page.evaluate(() => document.activeElement?.blur());
    newRelease.on = true;
    await t.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await t.page.waitForFunction(() => document.querySelector('app-update-banner')?.innerText.includes('Updating when you finish'), { timeout: 20000 });
    await sleep(1500);
    await shot(t.page, '11-update-banner-while-dirty');
    check('new release + dirty unfocused form: banner says "Updating when you finish", no reload, text intact',
      await t.page.evaluate(() => window.__sameDocument === true) && await t.page.$eval(`${editor} #annotation-message`, el => el.value === 'Unsaved text during a release.'));

    // 6b. Crossing the layout breakpoint (tablet rotation) rebuilds the page: the typed text must survive.
    await t.page.setViewport({ width: 1000, height: 1000 });
    await t.page.waitForFunction(sel => document.querySelector(`${sel} #annotation-message`)?.value === 'Unsaved text during a release.', { timeout: 30000 }, editor);
    await t.page.setViewport({ width: 1366, height: 1000 });
    await t.page.waitForFunction(sel => document.querySelector(`${sel} #annotation-message`)?.value === 'Unsaved text during a release.', { timeout: 30000 }, editor);
    await t.page.waitForFunction(() => /Grammar\s+18/.test(document.body.innerText), { timeout: 60000 });
    await shot(t.page, '11b-after-rotation');
    check('rotation across the breakpoint rebuilds the page but keeps the typed text and the banner', await t.page.evaluate(() => document.querySelector('app-update-banner')?.innerText.includes('Updating when you finish')));

    // 7. Leaving with unsaved input: route change, Previous/Next, tab close.
    t.seen.dialogs.length = 0;
    await t.page.evaluate(() => [...document.querySelectorAll('a,button')].find(el => /^My Classes$/.test(el.textContent.trim())).click());
    await sleep(800);
    check('route change with unsaved input prompts; refusing stays on the page with the text', t.seen.dialogs.includes('confirm') && t.page.url().includes('student-submissions') && await t.page.evaluate(() => window.__sameDocument === true), t.seen.dialogs);
    t.seen.dialogs.length = 0;
    await t.page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Next' || b.textContent.trim() === 'Previous')?.click());
    await sleep(600);
    const nextEnabled = await t.page.evaluate(() => [...document.querySelectorAll('button')].some(b => (b.textContent.trim() === 'Next' || b.textContent.trim() === 'Previous') && !b.disabled));
    report.prevNextEnabled = nextEnabled;
    if (nextEnabled) {
      await t.page.evaluate(() => [...document.querySelectorAll('button')].find(b => (b.textContent.trim() === 'Next' || b.textContent.trim() === 'Previous') && !b.disabled).click());
      await sleep(600);
      check('Previous/Next with unsaved input prompts; refusing keeps the text', t.seen.dialogs.includes('confirm') && await t.page.$eval(`${editor} #annotation-message`, el => el.value === 'Unsaved text during a release.'), t.seen.dialogs);
    } else report.steps.push({ name: 'Previous/Next prompt: not exercised (fixture has one submission per student on this page)', ok: true });
    t.seen.dialogs.length = 0;
    await t.page.close({ runBeforeUnload: true });
    await sleep(800);
    check('tab close with unsaved input prompts (beforeunload); dismissing keeps the tab open', t.seen.dialogs.includes('beforeunload') && !t.page.isClosed(), t.seen.dialogs);
    await shot(t.page, '12-tab-close-stayed');
    // Saving clears the registration: the banner offers Refresh again and tab close no longer prompts.
    await clickButton(t.page, 'Cancel');
    await t.page.waitForFunction(() => document.querySelector('app-update-banner')?.innerText.includes('A new version is available'), { timeout: 20000 });
    await shot(t.page, '13-banner-after-discard');
    check('after Cancel the banner offers Refresh again', true);
    newRelease.on = false;
    await t.context.close();

    // 8. Closed class: the whole editor is read-only.
    await Class.updateOne({ _id: fixture.IDS.class }, { $set: { status: 'archived' } });
    const closed = await open('teacher-closed-class', teacherJwt, teacherUrl('registered'), 'app-student-submission-pages');
    await openEditor(closed.page); await sleep(300);
    await shot(closed.page, '14-closed-class');
    report.closedSnapshot = await closed.page.evaluate(async (id, token) => { const r = await fetch(`/api/submissions/${id}/teacher-annotations`, { headers: { Authorization: `Bearer ${token}` } }); const d = (await r.json()).data; return { readOnly: d.readOnly, readOnlyReason: d.readOnlyReason }; }, String(fixture.IDS.registered), teacherJwt);
    check('closed class: the snapshot says read-only, with the reason', report.closedSnapshot.readOnly === true && report.closedSnapshot.readOnlyReason === 'CLASS_CLOSED', report.closedSnapshot);
    check('closed class: read-only message, no action buttons', (await editorText(closed.page)).includes('read-only') && (await closed.page.$$eval(`${editor} [data-row-key] button`, b => b.length)) === 0);
    await closed.context.close();
    await Class.updateOne({ _id: fixture.IDS.class }, { $set: { status: 'active' } });

    // 9. Tablet width and 300 corrections.
    const perfWords = Array.from({ length: 480 }, (_, i) => (i % 4 === 0 ? `goes${i}` : `word${i}`));
    const perfSpecs = Array.from({ length: 300 }, (_, k) => [Math.floor(k * 1.6), k % 2 ? 'SP' : 'AGR', k % 2 ? 'MECHANICS' : 'GRAMMAR', 'fix', `Message ${k}.`]);
    await rerunOcr({ submissionId: fixture.IDS.guest, words: perfWords, specs: perfSpecs, ocrJobId: 'job-qa-perf' });
    const perf = await open('teacher-300', teacherJwt, teacherUrl('guest'), 'app-student-submission-pages', { width: 820 });
    await perf.page.waitForSelector(editor, { timeout: 60000 }); await perf.page.waitForFunction(() => /Grammar\s+18/.test(document.body.innerText), { timeout: 90000 });
    const clock = async fn => { const started = Date.now(); await fn(); return Date.now() - started; };
    await sleep(6000);   // let the page's own loading finish, so the timing is the editor's
    report.timings.openEditorMs = await clock(async () => { await perf.page.evaluate(sel => [...document.querySelector(sel).querySelectorAll('button')].find(b => b.textContent.trim() === 'Open').click(), editor); await perf.page.waitForSelector(`${editor} [data-row-key]`, { timeout: 60000 }); });
    report.timings.rowsRendered = await perf.page.$$eval(`${editor} [data-row-key]`, r => r.length);
    report.timings.filterClickMs = await perf.page.evaluate(async sel => { const button = [...document.querySelector(sel).querySelectorAll('.filter')].find(b => b.textContent.startsWith('Hidden')); const t0 = performance.now(); button.click(); await new Promise(r => requestAnimationFrame(() => setTimeout(r))); return Math.round(performance.now() - t0); }, editor);
    await perf.page.evaluate(sel => [...document.querySelector(sel).querySelectorAll('.filter')].find(b => b.textContent.startsWith('All')).click(), editor); await sleep(200);
    const firstKey = await perf.page.$eval(`${editor} [data-row-key]`, r => r.getAttribute('data-row-key'));
    report.timings.hideRoundTripMs = await clock(async () => { await clickIn(perf.page, firstKey, 'Hide'); await waitNotice(perf.page, 'Hidden from the student.'); });
    report.timings.showMoreMs = await perf.page.evaluate(async sel => { const button = [...document.querySelector(sel).querySelectorAll('button')].find(b => b.textContent.startsWith('Show more')); const t0 = performance.now(); button.click(); await new Promise(r => requestAnimationFrame(() => setTimeout(r))); return Math.round(performance.now() - t0); }, editor);
    await perf.page.evaluate(sel => document.querySelector(sel).scrollIntoView(), editor);
    await shot(perf.page, '15-tablet-300-corrections');
    report.tabletOverflow = await perf.page.evaluate(sel => { const e = document.querySelector(sel); return e.scrollWidth > e.clientWidth + 1; }, editor);
    check('300 corrections: rendering capped at 50 rows; tablet width has no horizontal overflow', report.timings.rowsRendered === 50 && !report.tabletOverflow, report.timings);
    await perf.context.close();
  } catch (error) {
    report.failures.push(`aborted: ${error.message}`);
    console.error('ABORTED', error);
    for (const ctx of browser.browserContexts()) for (const page of await ctx.pages().catch(() => [])) await page.screenshot({ path: path.join(out, `abort-${Date.now()}.png`) }).catch(() => {});
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`\n${report.steps.filter(s => s.ok).length} passed, ${report.failures.length} failed`);
    console.log('console errors:', JSON.stringify(report.consoleErrors, null, 1));
    console.log('failed calls:', JSON.stringify(report.failedCalls, null, 1));
    console.log('timings:', JSON.stringify(report.timings));
    await browser.close(); api.close(); site.close(); await disconnectInMemoryMongo();
    fs.rmSync(uploadRoot, { recursive: true, force: true });
    process.exit(report.failures.length ? 1 : 0);
  }
})();
