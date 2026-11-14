'use strict';
// Real-browser QA for fix/emails-portal-pdf, against the real backend code in-process with an in-memory database and synthetic data.
// SMTP is replaced by an in-memory capture (nothing is ever sent). Proves and screenshots:
//   1. View Submissions: "Email sent HH:MM", the helper text and "Resend email" (with its confirmation) for a sent teacher upload.
//   3. The /recover portal with several submissions in different assignments and classes, including "Sign in to view" account work.
//   4. The student and guest results pages with the Assignment block (title, class, description), and the first page of the
//      feedback PDF (teacher download and the guest's own download): description block and "Student email" filled.
//   node scripts/qa-emails-portal-pdf.cjs [outputDir]     (needs the backend next to this repo, and npm run build:prod)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BACKEND = path.resolve(__dirname, '../../backend');
const FRONT_PORT = 4397;
Object.assign(process.env, { JWT_SECRET: 'qa-emails-portal-pdf', NODE_ENV: 'test', GUEST_SUBMISSION_ENABLED: 'true', FRONTEND_URL: `http://localhost:${FRONT_PORT}`,
  UPLOAD_BASE_PATH: `uploads/qa-emails-portal-pdf-${process.pid}`, SENSITIVE_RATE_LIMIT_MAX: '100000', AUTH_READ_RATE_LIMIT_MAX: '100000', AUTH_WRITE_RATE_LIMIT_MAX: '100000',
  BASELINE_RATE_LIMIT_MAX: '100000', COARSE_IP_RATE_LIMIT_MAX: '100000', ENABLE_TEST_PDF_HTTP: 'true', SMTP_USER: 'noreply@sender.example', SMTP_PASS: 'synthetic-only' });
const need = name => require(path.join(BACKEND, name));
// SMTP capture: the app's email service gets this transport; every "send" is recorded and reported as accepted.
const mails = [];
const nodemailerPath = require.resolve(path.join(BACKEND, 'node_modules/nodemailer'));
require.cache[nodemailerPath] = { id: nodemailerPath, filename: nodemailerPath, loaded: true, exports: { createTransport: () => ({
  sendMail: async message => { mails.push(message); return { accepted: String(message.to).split(',').map(a => a.trim()), rejected: [], response: '250 2.0.0 Ok', messageId: `<qa-${mails.length}@sender.example>` }; },
  verify: async () => true, close: () => {} }) } };
const express = need('node_modules/express'), puppeteer = need('node_modules/puppeteer');
const quiet = need('src/utils/logger');
for (const level of ['debug', 'info', 'warn', 'metric']) if (typeof quiet[level] === 'function') quiet[level] = () => {};
const app = need('src/app');
const { connectInMemoryMongo, disconnectInMemoryMongo } = need('tests/helpers/testServer');
const { seedTestPlans } = need('tests/helpers/seedTestPlans');
const { signTestJwt } = need('tests/helpers/auth');
const { seedAnnotationFixture } = need('tests/helpers/annotationFixture');
const access = need('src/services/guestAccess.service');
const portal = need('src/services/recoveryPortal.service');
const worker = need('src/services/teacherUploadEmail.service');
const [Submission, File, Assignment, Class, User, Membership] = ['Submission', 'File', 'assignment.model', 'class.model', 'user.model', 'membership.model'].map(m => need(`src/models/${m}`));

const out = path.resolve(process.argv[2] || path.join(__dirname, '../../output/qa-emails-portal-pdf'));
const uploadRoot = path.resolve(BACKEND, process.env.UPLOAD_BASE_PATH);
const build = path.resolve(__dirname, '../dist/rozna-comarker-fe/browser');
const report = { steps: [], failures: [], consoleErrors: {}, failedCalls: {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function check(name, ok, detail) { report.steps.push({ name, ok: Boolean(ok), ...(detail !== undefined ? { detail } : {}) }); if (!ok) report.failures.push(name); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined && !ok ? `  -> ${JSON.stringify(detail).slice(0, 600)}` : ''}`); }
const DESCRIPTION = 'Write about a weekend you enjoyed.\nUse the past tense and at least 150 words.\nCheck your spelling before you hand it in.';

(async () => {
  fs.mkdirSync(out, { recursive: true });
  await connectInMemoryMongo(); await seedTestPlans();
  const fixture = await seedAnnotationFixture({ uploadRoot });
  for (const [fileId, submissionId, stored] of [[fixture.IDS.fileRegistered, fixture.IDS.registered, '00000000-0000-4000-8000-0000000000f1.png'], [fixture.IDS.fileGuest, fixture.IDS.guest, '00000000-0000-4000-8000-0000000000f2.png']]) {
    fs.renameSync(path.join(uploadRoot, 'submissions', `${fileId}.png`), path.join(uploadRoot, 'submissions', stored));
    await File.updateOne({ _id: fileId }, { $set: { filename: stored, path: `${process.env.UPLOAD_BASE_PATH}/submissions/${stored}`, url: `/uploads/submissions/${stored}` } });
    await Submission.updateOne({ _id: submissionId }, { $set: { fileUrl: `/uploads/submissions/${stored}`, fileUrls: [`/uploads/submissions/${stored}`] } });
  }
  await Assignment.updateOne({ _id: fixture.IDS.assignment }, { $set: { instructions: DESCRIPTION, title: 'My Summer Weekend' } });
  await User.updateOne({ _id: fixture.teacher._id }, { $set: { displayName: 'Ms Rahman' } });
  const GUEST_EMAIL = 'guest.student@example.com';
  // Problem 3 data: more work for the guest's address (other assignments, another class, another teacher) and account work.
  const t2 = await User.create({ firebaseUid: 'qa-t2', email: 't2@example.com', role: 'teacher', displayName: 'Mr Lee' });
  const c2 = await Class.create({ name: 'Writing 8A', teacher: fixture.teacher._id, joinCode: 'QA-C2' });
  const c3 = await Class.create({ name: 'English Club', teacher: t2._id, joinCode: 'QA-C3' });
  const mk = (title, c, teacher, extra = {}) => Assignment.create({ title, class: c._id, teacher: teacher._id, instructions: 'Write.', qrToken: `qr-${crypto.randomUUID()}`, allowGuestSubmission: false, ...extra });
  const [aPoem, aLetter, aStory] = [await mk('A Poem About Rain', c2, fixture.teacher), await mk('Letter to a Friend', c3, t2), await mk('Short Story', c2, fixture.teacher)];
  const upload = teacher => ({ uploadedBy: teacher._id, batchId: 'qa-batch', uploadedAt: new Date(), email: { status: 'sent', sentAt: new Date() } });
  for (const [a, teacher] of [[aPoem, fixture.teacher], [aLetter, t2]]) {
    await Submission.create({ submissionMode: 'guest', assignment: a._id, class: a.class, submittedAt: new Date(Date.now() - 86400000), status: 'submitted', assessmentStatus: 'processing',
      guest: { displayName: 'Guest Student', normalizedEmail: GUEST_EMAIL }, teacherUpload: upload(teacher) });
  }
  const account = await User.create({ firebaseUid: 'qa-account', email: GUEST_EMAIL, role: 'student', displayName: 'Guest Student' });
  await Membership.create({ student: account._id, class: c2._id, status: 'active' });
  await Submission.create({ submissionMode: 'registered', student: account._id, assignment: aStory._id, class: c2._id, submittedAt: new Date(Date.now() - 2 * 86400000), status: 'submitted', assessmentStatus: 'complete' });
  // Problem 1 data: the fixture guest submission is a teacher upload whose email was sent at 09:22 today.
  const sentAt = new Date(); sentAt.setHours(9, 22, 0, 0);
  await Submission.updateOne({ _id: fixture.IDS.guest }, { $set: { teacherUpload: { uploadedBy: fixture.teacher._id, batchId: 'qa-batch', uploadedAt: new Date(), typedName: 'Guest Student',
    email: { status: 'sent', sentAt: new Date(Date.now() - 5 * 60 * 1000), requestedAt: new Date(Date.now() - 6 * 60 * 1000), attempts: 1 } } } });

  const frontend = express();
  frontend.use(express.static(build));
  frontend.get(/.*/, (_req, res) => res.sendFile(path.join(build, 'index.html')));
  const listen = (server, port, host) => new Promise((resolve, reject) => { const l = server.listen(port, host, () => resolve(l)); l.on('error', reject); });
  const apiServer = await listen(app, 0, '127.0.0.1'), site = await listen(frontend, FRONT_PORT, '127.0.0.1');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const base = `http://localhost:${FRONT_PORT}`;
  const teacherJwt = signTestJwt({ id: fixture.teacher._id, role: 'teacher', firebaseUid: fixture.teacher.firebaseUid });
  const studentJwt = signTestJwt({ id: fixture.student._id, role: 'student', firebaseUid: fixture.student.firebaseUid });

  async function open(label, jwt, url, ready, { width = 1280, height = 1000 } = {}) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width, height });
    if (jwt) await page.evaluateOnNewDocument(token => { localStorage.setItem('backend_jwt', token); }, jwt);
    report.consoleErrors[label] = []; report.failedCalls[label] = [];
    page.on('console', msg => { if (msg.type() === 'error') report.consoleErrors[label].push(msg.text().replace(/[a-f0-9]{24}/g, '<id>').slice(0, 200)); });
    page.on('pageerror', error => report.consoleErrors[label].push(`pageerror: ${String(error.message).slice(0, 200)}`));
    await page.setRequestInterception(true);
    page.on('request', req => {
      const target = new URL(req.url());
      if (target.pathname.startsWith('/api/') || target.pathname.startsWith('/uploads/')) return req.continue({ url: `http://127.0.0.1:${apiServer.address().port}${target.pathname}${target.search}` });
      if (['127.0.0.1', 'localhost'].includes(target.hostname) || ['data:', 'blob:'].includes(target.protocol)) return req.continue();
      if (req.resourceType() === 'stylesheet') return req.respond({ status: 200, contentType: 'text/css', body: '' });
      return req.abort();
    });
    page.on('response', res => {
      const target = new URL(res.url());
      if (target.pathname.startsWith('/api/') && res.status() >= 400) report.failedCalls[label].push(`${res.request().method()} ${target.pathname.replace(/[a-f0-9]{24}/g, ':id')} ${res.status()}`);
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (ready) await page.waitForSelector(ready, { timeout: 60000 });
    return { page, context };
  }
  const shot = (page, name, opts = {}) => page.screenshot({ path: path.join(out, `${name}.png`), ...opts });

  try {
    // ---- Problem 1: View Submissions chip, helper text, Resend email.
    {
      const t = await open('p1-view-submissions', teacherJwt, `${base}/teacher/my-classes/detail/${fixture.IDS.class}`, 'app-root');
      await t.page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => /view submissions/i.test(b.textContent || '')), { timeout: 60000 });
      await t.page.evaluate(() => [...document.querySelectorAll('button')].find(b => /view submissions/i.test(b.textContent || '')).click());
      await t.page.waitForSelector('[data-teacher-upload] [data-resend-email]', { timeout: 60000 });
      await sleep(800);
      const info = await t.page.$eval('[data-teacher-upload]', el => ({ text: el.textContent.replace(/\s+/g, ' '), help: el.querySelector('[data-sent-help]')?.textContent?.trim() }));
      check('P1 chip shows "Email sent HH:MM"', /Email sent \d{2}:\d{2}/.test(info.text), info.text);
      check('P1 helper text shown', info.help === 'Sent means the mail server accepted it; delivery to the inbox can take a few minutes or land in spam.', info.help);
      await (await t.page.$('[data-teacher-upload]')).evaluate(el => el.scrollIntoView({ block: 'center' }));
      await shot(t.page, 'p1-view-submissions-email-sent');
      await t.page.click('[data-resend-email]');
      await t.page.waitForFunction(() => /This will send the link again/.test(document.body.innerText), { timeout: 10000 });
      await sleep(400);
      await shot(t.page, 'p1-resend-confirmation');
      const before = mails.length;
      await t.page.evaluate(() => [...document.querySelectorAll('.swal2-confirm, button')].find(b => /^\s*Resend email\s*$/.test(b.textContent || '') && b.closest('.swal2-popup')).click());
      await t.page.waitForFunction(() => /Email queued/.test(document.body.innerText), { timeout: 10000 });
      await worker.run();
      const state = (await Submission.findById(fixture.IDS.guest).select('+teacherUpload').lean()).teacherUpload.email;
      check('P1 Resend email queues once and the worker sends it (SMTP accepted, codes stored)', mails.length === before + 1 && state.status === 'sent' && state.smtpResponseCode === 250 && state.acceptedCount === 1, { sent: mails.length - before, state: { status: state.status, code: state.smtpResponseCode } });
      await t.context.close();
    }

    // ---- Problem 3: the portal.
    {
      const before = mails.length;
      const issued = await portal.issueLink(GUEST_EMAIL);
      const mail = mails[before];
      const link = mail && new URL(/href="([^"]*\/recover\/portal#[^"]+)"/.exec(mail.html)[1].replace(/&amp;/g, '&'));
      check('P3 /recover link is the all-submissions portal link', issued.sent && link && link.pathname === '/recover/portal', issued);
      const p = await open('p3-portal', null, `${base}${link.pathname}${link.hash}`, '.portal-list', { width: 900, height: 1000 });
      await sleep(800);
      const rows = await p.page.$$eval('.portal-list li', lis => lis.map(li => li.textContent.replace(/\s+/g, ' ').trim()));
      check('P3 portal lists guest work in several assignments/classes/teachers and the account work as "Sign in to view"',
        rows.length === 4 && rows.some(r => r.includes('My Summer Weekend')) && rows.some(r => r.includes('A Poem About Rain')) && rows.some(r => r.includes('Letter to a Friend'))
        && rows.some(r => r.includes('Short Story') && r.includes('Sign in to view')), rows);
      await shot(p.page, 'p3-portal-all-submissions', { fullPage: true });
      await p.context.close();
    }

    // ---- Problem 4: results pages with the Assignment block.
    for (const [label, jwt, url] of [['p4-student-results', studentJwt, `${base}/student/my-classes/detail/my-submissions/${fixture.IDS.assignment}?classId=${fixture.IDS.class}`],
      ['p4-guest-results', null, (() => { const u = new URL(access.returnUrl(String(fixture.IDS.guest), fixture.guestToken)); return `${base}${u.pathname}${u.hash}`; })()]]) {
      const r = await open(label, jwt, url, '[data-assignment-brief]', { width: 1280, height: 900 });
      await sleep(1500);
      const brief = await r.page.$eval('[data-assignment-brief]', el => ({ text: el.innerText, description: el.querySelector('[data-assignment-description]')?.innerText || '' }));
      check(`${label}: Assignment block with title, class and the description (line breaks kept)`,
        brief.text.includes('My Summer Weekend') && brief.text.includes('Class: Writing 7B') && brief.description.split('\n').length === 3, brief);
      await (await r.page.$('[data-assignment-brief]')).evaluate(el => el.scrollIntoView({ block: 'start' }));
      await shot(r.page, `${label}-assignment-block`);
      await r.context.close();
    }

    // ---- Problem 4: the PDF's first page (teacher download of the guest's work, and the guest's own download).
    const pdfjs = need('node_modules/pdfjs-dist/legacy/build/pdf.js');
    const { createCanvas } = need('node_modules/canvas');
    const request = need('node_modules/supertest');
    const binary = (res, cb) => { const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); };
    for (const [label, call] of [['p4-pdf-teacher', () => request(app).get(`/api/pdf/download/${fixture.IDS.guest}`).set('Authorization', `Bearer ${teacherJwt}`)],
      ['p4-pdf-guest', () => request(app).get(`/api/guest/submissions/${fixture.IDS.guest}/pdf`).set('X-Guest-Token', fixture.guestToken)]]) {
      const res = await call().buffer(true).parse(binary);
      check(`${label}: PDF downloaded`, res.status === 200 && res.body.subarray(0, 5).toString() === '%PDF-', res.status);
      if (res.status !== 200) continue;
      fs.writeFileSync(path.join(out, `${label}.pdf`), res.body);
      const doc = await pdfjs.getDocument({ data: new Uint8Array(res.body), disableWorker: true }).promise;
      const page = await doc.getPage(1);
      const text = (await page.getTextContent()).items.map(i => i.str).join(' ');
      check(`${label}: first page has the description, the student email and the teacher name (never an email)`,
        text.includes('Write about a weekend you enjoyed.') && text.includes('guest.student@example.com') && text.includes('Ms Rahman') && !text.includes('teacher@example.com'), text.slice(0, 600));
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = createCanvas(viewport.width, viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      fs.writeFileSync(path.join(out, `${label}-page1.png`), canvas.toBuffer('image/png'));
    }
  } catch (error) {
    report.failures.push(`aborted: ${error.message}`);
    console.error('ABORTED', error);
    for (const ctx of browser.browserContexts()) for (const page of await ctx.pages().catch(() => [])) await page.screenshot({ path: path.join(out, `abort-${Date.now()}.png`) }).catch(() => {});
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`\n${report.steps.filter(s => s.ok).length} passed, ${report.failures.length} failed`);
    console.log('failed calls:', JSON.stringify(report.failedCalls, null, 1));
    console.log('console errors:', JSON.stringify(report.consoleErrors, null, 1));
    await browser.close(); apiServer.close(); site.close();
    try { await need('src/services/pdfBrowserManager.service').closeBrowser(); } catch { /* not started */ }
    await disconnectInMemoryMongo();
    fs.rmSync(uploadRoot, { recursive: true, force: true });
    process.exit(report.failures.length ? 1 : 0);
  }
})();
