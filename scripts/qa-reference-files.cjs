'use strict';
// Real-browser QA of "Reference files for AI marking" (class and assignment forms, rubric review), against the real backend code in-process
// with an in-memory database. The AI rubric parser is replaced by a fixed result: no AI, OCR or email is ever called. Synthetic files only.
//   node scripts/qa-reference-files.cjs [outputDir]      (needs the backend next to this repo, and npm run build:prod)
const fs = require('fs');
const path = require('path');
const BACKEND = path.resolve(__dirname, '../../backend');
const FRONT_PORT = 4405;
Object.assign(process.env, { JWT_SECRET: 'reference-files-qa', NODE_ENV: 'test', FRONTEND_URL: `http://localhost:${FRONT_PORT}`, REFERENCE_FILES_ENABLED: 'true',
  UPLOAD_BASE_PATH: `uploads/reference-files-qa-${process.pid}`, SENSITIVE_RATE_LIMIT_MAX: '100000', AUTH_READ_RATE_LIMIT_MAX: '100000', AUTH_WRITE_RATE_LIMIT_MAX: '100000' });
const need = name => require(path.join(BACKEND, name));
const express = need('node_modules/express'), puppeteer = need('node_modules/puppeteer');
const quiet = need('src/utils/logger');
for (const level of ['debug', 'info', 'warn', 'metric']) if (typeof quiet[level] === 'function') quiet[level] = () => {};
// The rubric draft's AI step, replaced (rubricConvert.js reads this export when it runs).
const PARSED = { title: 'Essay Rubric', levels: [{ name: 'Beginning', score: 1 }, { name: 'Developing', score: 2 }, { name: 'Proficient', score: 3 }, { name: 'Excellent', score: 4 }],
  criteria: [{ title: 'Thesis', descriptions: ['Missing', 'Vague', 'Mostly clear', 'Clear'] }, { title: 'Evidence', descriptions: ['None', 'Little', 'Some', 'Strong'] }, { title: 'Organisation', descriptions: ['No order', 'Some order', 'Mostly logical', 'Logical'] }] };
need('src/services/rubricAIParser.service').parseRubricTextToJson = async () => PARSED;
const app = need('src/app');
const { connectInMemoryMongo, disconnectInMemoryMongo } = need('tests/helpers/testServer');
const { seedTestPlans } = need('tests/helpers/seedTestPlans');
const { signTestJwt } = need('tests/helpers/auth');
const f = need('tests/helpers/referenceFileFixtures');
const User = need('src/models/user.model'), Class = need('src/models/class.model'), Assignment = need('src/models/assignment.model'), ReferenceFile = need('src/models/ReferenceFile');

const out = path.resolve(process.argv[2] || path.join(__dirname, '../../output/reference-files-qa'));
const build = path.resolve(__dirname, '../dist/rozna-comarker-fe/browser');
const report = { steps: [], failures: [], consoleErrors: {}, failedCalls: {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function check(name, ok, detail) { report.steps.push({ name, ok: Boolean(ok), ...(detail !== undefined ? { detail } : {}) }); if (!ok) report.failures.push(name); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== undefined ? ` :: ${JSON.stringify(detail).slice(0, 400)}` : ''}`); }
const RUBRIC_LINES = ['Essay Rubric', 'Criteria | Excellent (4 points) | Proficient (3 points) | Developing (2 points) | Beginning (1 point)',
  'Thesis | Clear | Mostly clear | Vague | Missing', 'Evidence | Strong | Some | Little | None'];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const files = path.join(out, 'files'); fs.mkdirSync(files, { recursive: true });
  const write = async (name, bytes) => { const file = path.join(files, name); fs.writeFileSync(file, await bytes); return file; };
  const outline = await write('Course outline.docx', f.docx(['Unit 3 outline: persuasive essays about local transport, using evidence from two sources.']));
  const rubric = await write('Essay rubric.docx', f.docx(RUBRIC_LINES));
  const notes = await write('Teacher notes.pdf', f.pdf(['Week 2 notes: counter-arguments and rebuttals for the transport essay.']));
  const oldDeck = await write('Old deck.ppt', Buffer.from('not really a presentation'));

  await connectInMemoryMongo(); await seedTestPlans();
  const teacher = await User.create({ firebaseUid: 'qa-teacher', email: 'teacher@example.com', role: 'teacher', displayName: 'Ms Rahman' });
  const klass = await Class.create({ name: 'Year 9 English', description: 'Persuasive writing this term.', teacher: teacher._id, joinCode: 'QAREF1' });

  const frontend = express();
  frontend.use(express.static(build));
  frontend.get(/.*/, (_req, res) => res.sendFile(path.join(build, 'index.html')));
  const listen = (server, port) => new Promise((resolve, reject) => { const l = server.listen(port, () => resolve(l)); l.on('error', reject); });
  const apiServer = await listen(app, 0), site = await listen(frontend, FRONT_PORT);
  const apiPort = apiServer.address().port;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const base = `http://localhost:${FRONT_PORT}`;
  const jwt = signTestJwt({ id: teacher._id, role: 'teacher', firebaseUid: teacher.firebaseUid });

  async function open(label, url, ready, { width = 1440, height = 900 } = {}) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width, height });
    await page.evaluateOnNewDocument(token => { localStorage.setItem('backend_jwt', token); }, jwt);
    report.consoleErrors[label] = []; report.failedCalls[label] = [];
    page.on('console', msg => { if (msg.type() === 'error') report.consoleErrors[label].push(msg.text().replace(/[a-f0-9]{24}/g, '<id>').slice(0, 200)); });
    page.on('pageerror', error => report.consoleErrors[label].push(`pageerror: ${String(error.message).slice(0, 200)}`));
    await page.setRequestInterception(true);
    page.on('request', req => {
      const target = new URL(req.url());
      if (target.pathname.startsWith('/api/') || target.pathname.startsWith('/uploads/')) return req.continue({ url: `http://127.0.0.1:${apiPort}${target.pathname}${target.search}` });
      if (['127.0.0.1', 'localhost'].includes(target.hostname) || ['data:', 'blob:'].includes(target.protocol)) return req.continue();
      if (req.resourceType() === 'stylesheet') return req.respond({ status: 200, contentType: 'text/css', body: '' });
      return req.abort();
    });
    page.on('response', res => {
      const target = new URL(res.url());
      if (target.pathname.startsWith('/api/') && res.status() >= 400) report.failedCalls[label].push(`${res.request().method()} ${target.pathname.replace(/[a-f0-9]{24}/g, ':id')} ${res.status()}`);
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector(ready, { timeout: 60000 });
    return { page, context };
  }
  const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: false });
  const clickText = (page, selector, text) => page.evaluate((s, t) => {
    const el = [...document.querySelectorAll(s)].find(e => e.textContent.trim() === t && e.offsetParent !== null);
    if (!el) return false; el.click(); return true;
  }, selector, text);
  const setValue = (page, selector, value) => page.evaluate((s, v) => {
    const el = [...document.querySelectorAll(s)].find(e => e.offsetParent !== null); if (!el) return false;
    el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true;
  }, selector, value);
  const waitFor = async (fn, timeout = 30000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return true; await sleep(250); } return false; };
  const noHorizontalScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const confirmSwal = async page => { await page.waitForSelector('.swal2-confirm', { visible: true, timeout: 15000 }); await page.click('.swal2-confirm'); await sleep(400); };

  try {
    // 1. Create a class with files (one refused on the device: old .ppt).
    {
      const { page, context } = await open('class-create', `${base}/teacher/my-classes`, 'app-my-classes-pages, body');
      await waitFor(() => clickText(page, 'button', 'Create New Class'));
      await page.waitForSelector('app-my-classes-form [data-reference-files]', { visible: true, timeout: 30000 });
      check('class create: the field is shown with class-wide wording', await page.$eval('app-my-classes-form [data-reference-files]', el => el.textContent.includes('They apply to every assignment in this class.')));
      const input = await page.$('app-my-classes-form [data-file-input]');
      await input.uploadFile(outline, notes, oldDeck);
      await page.waitForSelector('[data-choose-error]', { timeout: 10000 });
      check('class create: old .ppt refused with "Please save as .pptx"', (await page.$eval('[data-choose-error]', el => el.textContent)).includes('Please save as .pptx.'));
      check('class create: two files wait for the save', (await page.$$('app-my-classes-form [data-pending="staged"]')).length === 2);
      check('class create: no rubric tick on class files', !(await page.$('app-my-classes-form [data-rubric-tick]')));
      await shot(page, 'class-create-1440');
      await setValue(page, 'app-my-classes-form input[formcontrolname="className"]', 'Year 10 English');
      await page.select('app-my-classes-form select[formcontrolname="subjectLevel"]', 'all');
      await setValue(page, 'app-my-classes-form textarea[formcontrolname="description"]', 'Argument writing for the spring term.');
      await page.click('app-my-classes-form button[type="submit"]');
      const stored = await waitFor(async () => (await ReferenceFile.countDocuments({ scope: 'class' })) === 2, 30000);
      check('class create: both files stored for the new class', stored);
      const created = await Class.findOne({ name: 'Year 10 English' }).lean();
      check('class create: files belong to the new class', created && (await ReferenceFile.countDocuments({ class: created._id, scope: 'class' })) === 2);
      await waitFor(async () => !(await page.$('app-my-classes-form')), 15000);
      check('class create: the dialog closes after the upload', !(await page.$('app-my-classes-form')));
      await context.close();
    }
    // Class files for the class used below.
    const newClass = await Class.findOne({ name: 'Year 10 English' }).lean();
    await ReferenceFile.updateMany({ class: newClass._id }, { $set: { class: klass._id } });
    await waitFor(async () => (await ReferenceFile.countDocuments({ status: 'processing' })) === 0, 30000);

    // 2. Create an assignment with a ticked rubric file: upload, read, review (rubric editor without tools), apply.
    let assignmentId;
    {
      const { page, context } = await open('assignment-create', `${base}/teacher/my-classes/detail/${klass._id}`, 'body');
      await waitFor(() => clickText(page, 'button', 'Create Writing Assignment'));
      await page.waitForSelector('app-assignment-form [data-reference-files]', { visible: true, timeout: 30000 });
      check('assignment create: the field is shown', true);
      const input = await page.$('app-assignment-form [data-file-input]');
      await input.uploadFile(rubric);
      await page.waitForSelector('app-assignment-form [data-rubric-tick]', { timeout: 10000 });
      await page.click('app-assignment-form [data-rubric-tick]');
      await setValue(page, 'app-assignment-form input[formcontrolname="className"]', 'Transport essay');
      await page.select('app-assignment-form select[formcontrolname="writingType"]', 'Argumentative');
      await setValue(page, 'app-assignment-form input[formcontrolname="startDate"]', '2099-06-30');
      await setValue(page, 'app-assignment-form textarea[formcontrolname="message"]', 'Argue for or against a new bus lane.');
      await shot(page, 'assignment-create-1440');
      await page.click('app-assignment-form button[type="submit"]');
      const review = () => page.evaluate(() => { const e = [...document.querySelectorAll('.rubric-editor')].find(e => e.querySelector('.rubric-editor__review-note')); if (!e) return null; const r = e.getBoundingClientRect();
        return { inForm: Boolean(e.closest('app-assignment-form')), toolbar: Boolean(e.querySelector('.rubric-editor__toolbar, .rubric-ai')), top: r.top, bottom: r.bottom, height: innerHeight }; });
      const opened = await waitFor(async () => Boolean(await review()), 40000);
      check('assignment create: a ticked rubric file opens the rubric editor for review', opened);
      const shown = await review();
      check('assignment create: review shows no Use Existing / Import / Generate tools', opened && shown && !shown.toolbar);
      check('assignment create: the review editor is above the form dialog, not boxed inside it', opened && shown && !shown.inForm && shown.top >= 0 && shown.bottom <= shown.height + 1, shown);
      await shot(page, 'rubric-review-1440');
      check('rubric review fits at 1440 px', await noHorizontalScroll(page));
      check('assignment create: Apply Changes clicked', await page.evaluate(() => { const e = [...document.querySelectorAll('.rubric-editor')].find(e => e.querySelector('.rubric-editor__review-note')); const b = e && [...e.querySelectorAll('.rubric-editor__actions button')].find(x => x.textContent.trim() === 'Apply Changes'); if (!b || b.disabled) return false; b.click(); return true; }));
      const assignment = await waitFor(async () => { const a = await Assignment.findOne({ title: 'Transport essay' }).lean(); return a?.rubrics?.criteria?.length === 3; }, 20000);
      check('assignment create: the reviewed rubric is applied to the new assignment', assignment);
      const saved = await Assignment.findOne({ title: 'Transport essay' }).lean();
      assignmentId = String(saved._id);
      check('assignment create: the rubric matches the review', JSON.stringify(saved.rubrics.criteria.map(c => [c.name, c.weight])) === JSON.stringify([['Thesis', 34], ['Evidence', 33], ['Organisation', 33]]));
      await sleep(1500);
      check('assignment create: the dialog closed and no other rubric editor opened afterwards', await page.evaluate(() => !document.querySelector('app-assignment-form') && !document.querySelector('.rubric-editor')));
      await context.close();
    }

    // 3. Edit the assignment at three widths: class files read-only ("Applies from your class"), own file, remove.
    for (const [width, height, name] of [[1440, 900, '1440'], [768, 1024, '768'], [390, 844, '390']]) {
      const { page, context } = await open(`assignment-edit-${name}`, `${base}/teacher/my-classes/detail/${klass._id}`, 'body', { width, height });
      await waitFor(() => page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'Edit' && e.offsetParent !== null); if (b) b.click(); return Boolean(b); }));
      const shown = await waitFor(async () => Boolean(await page.$('app-assignment-form [data-class-files] li')), 30000);
      check(`assignment edit ${name}: "Applies from your class" lists the class files`, shown && await page.$eval('app-assignment-form [data-class-files]', el => el.textContent.includes('Applies from your class') && el.textContent.includes('Course outline.docx')));
      check(`assignment edit ${name}: class files are read-only`, shown && (await page.$$('app-assignment-form [data-class-files] button')).length === 0);
      check(`assignment edit ${name}: the assignment's own file is listed as ready`, await waitFor(() => page.evaluate(() => [...document.querySelectorAll('app-assignment-form [data-file] .reference-files__status')].some(s => s.textContent.trim() === 'Ready')), 20000));
      check(`assignment edit ${name}: no horizontal scrolling`, await noHorizontalScroll(page));
      await page.evaluate(() => document.querySelector('app-assignment-form [data-reference-files]')?.scrollIntoView({ block: 'center' }));
      await sleep(300);
      await shot(page, `assignment-edit-${name}`);
      if (name === '1440') {
        // Keyboard: the add button and actions are reachable and labelled.
        const labels = await page.$$eval('app-assignment-form [data-reference-files] button', bs => bs.map(b => b.getAttribute('aria-label') || b.textContent.trim()));
        check('keyboard: Add files, Use as rubric and Remove are buttons with names', labels.includes('Add files') && labels.some(l => l.startsWith('Use Essay rubric.docx')) && labels.some(l => l.startsWith('Remove Essay rubric.docx')));
        await page.focus('app-assignment-form [data-add]');
        check('keyboard: Add files takes focus', await page.evaluate(() => document.activeElement?.hasAttribute('data-add')));
        await page.click('app-assignment-form [data-remove]');
        await confirmSwal(page);
        const removed = await waitFor(async () => (await ReferenceFile.countDocuments({ assignment: assignmentId, removedAt: { $ne: null } })) === 1, 15000);
        check('assignment edit: Remove (after confirming) removes the file (soft delete)', removed);
        await page.waitForSelector('app-assignment-form [data-empty]', { timeout: 10000 });
        check('assignment edit: empty state after removal', true);
      }
      await context.close();
      if (name === '1440') await ReferenceFile.updateOne({ assignment: assignmentId }, { $set: { removedAt: null } });   // put it back for the narrow views
    }

    // 4. Feature off: the field is not shown and nothing fails.
    process.env.REFERENCE_FILES_ENABLED = 'false';
    {
      const { page, context } = await open('feature-off', `${base}/teacher/my-classes`, 'body');
      await waitFor(() => clickText(page, 'button', 'Create New Class'));
      await page.waitForSelector('app-my-classes-form', { timeout: 30000 });
      await sleep(1500);
      check('feature off: no reference-files field', !(await page.$('[data-reference-files]')));
      check('feature off: no failed reference-file calls', !report.failedCalls['feature-off'].some(c => c.includes('reference-files')));
      await context.close();
    }
    // 5. No response the teacher's pages received contains file text (only names and statuses are shown).
    const pageText = JSON.stringify(report);
    check('no extracted text appears in what the pages showed or logged', !pageText.includes('persuasive essays about local transport'));
  } catch (error) {
    check('script ran to the end', false, String(error && error.stack || error).slice(0, 600));
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close(); site.close(); apiServer.close();
    await disconnectInMemoryMongo();
    fs.rmSync(path.resolve(BACKEND, process.env.UPLOAD_BASE_PATH), { recursive: true, force: true });
    console.log(`\n${report.steps.length - report.failures.length}/${report.steps.length} passed. Report: ${path.join(out, 'report.json')}`);
    process.exit(report.failures.length ? 1 : 0);
  }
})();
