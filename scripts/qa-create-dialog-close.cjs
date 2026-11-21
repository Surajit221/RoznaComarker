'use strict';
// Real-browser QA of closing the Create Assignment dialog (choice step, speaking form, writing form) and the two speaking upload dialogs, against
// the real backend code in-process with an in-memory database (as qa-speaking-flows.cjs). No network call leaves the machine; synthetic data only.
// At 1280 (modal), 900, 390 and 320 px (bottom sheet): the X, backdrop, Esc and Cancel paths when clean and dirty; the "Discard changes?"
// SweetAlert above the dialog (z-index and hit test), Esc inside it closing only the SweetAlert, a double click on Discard, focus return to the
// create button; the teacher "Upload work" dialog (speaking card) (backdrop, SweetAlert) and the student upload dialog (a chosen file, and an upload held
// in progress: "Stop the upload?"). Screenshots, console errors, failed calls and horizontal overflow for each.
//   node scripts/qa-create-dialog-close.cjs [outputDir]     (needs the backend next to this repo, and npm run build:prod)
const fs = require('fs');
const path = require('path');
const BACKEND = path.resolve(__dirname, '../../backend');
const FRONT_PORT = 4411;
Object.assign(process.env, { JWT_SECRET: 'create-dialog-qa', NODE_ENV: 'test', AUDIO_STT_ENABLED: 'true', FRONTEND_URL: `http://localhost:${FRONT_PORT}`,
  GUEST_SUBMISSION_ENABLED: 'true', UPLOAD_BASE_PATH: `uploads/create-dialog-qa-${process.pid}`, SENSITIVE_RATE_LIMIT_MAX: '100000', AUTH_READ_RATE_LIMIT_MAX: '100000',
  AUTH_WRITE_RATE_LIMIT_MAX: '100000', BASELINE_RATE_LIMIT_MAX: '1000000', SSE_TOKEN_RATE_LIMIT_MAX: '100000', COARSE_IP_RATE_LIMIT_MAX: '1000000',
  SPEAKING_UPLOAD_RATE_LIMIT_MAX: '100000' });
const localFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const host = new URL(String(url?.url || url)).hostname;
  if (!['127.0.0.1', 'localhost'].includes(host)) throw new Error(`REAL_NETWORK_CALL_BLOCKED ${host}`);
  return localFetch(url, init);
};
globalThis.jest = { fn: impl => { const fn = (...args) => impl(...args); return fn; } };

const need = name => require(path.join(BACKEND, name));
const express = need('node_modules/express'), puppeteer = need('node_modules/puppeteer');
const quiet = need('src/utils/logger');
for (const level of ['debug', 'info', 'warn', 'metric', 'error']) if (typeof quiet[level] === 'function') quiet[level] = () => {};
const app = need('src/app');
const { connectInMemoryMongo, disconnectInMemoryMongo } = need('tests/helpers/testServer');
const { seedTestPlans } = need('tests/helpers/seedTestPlans');
const { seedSpeaking } = need('tests/helpers/speakingFixtures');
const h = need('tests/helpers/speakingAssessmentFixtures');
const samples = need('tests/helpers/audioSamples');
const AudioRecording = need('src/models/AudioRecording');

const out = path.resolve(process.argv[2] || path.join(__dirname, '../../output/create-dialog-qa'));
const build = path.resolve(__dirname, '../dist/rozna-comarker-fe/browser');
const VIEWPORTS = [{ name: '1280', width: 1280, height: 900 }, { name: '900', width: 900, height: 1100 }, { name: '390', width: 390, height: 844 },
  { name: '320', width: 320, height: 700 }];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KNOWN_CALL = /GET \/api\/(subscription\/me|credits\/wallet)[^ ]* 500/;
const KNOWN_CONSOLE = /ERR_FAILED|ERR_BLOCKED|net::|Failed to load resource|fonts\.|googleapis|gstatic|unpkg|boxicons|getMySubscription|wallet/i;
const report = { checks: [], screenshots: [], failures: [], knownConsole: [] };

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const uploadRoot = path.resolve(BACKEND, process.env.UPLOAD_BASE_PATH);
  await connectInMemoryMongo(); await seedTestPlans(); await AudioRecording.createIndexes();
  const f = await seedSpeaking();
  await h.personalCredits(f.teacher.user, 50);
  const C = String(f.klass._id);

  const frontend = express();
  frontend.use(express.static(build));
  frontend.get(/.*/, (_req, res) => res.sendFile(path.join(build, 'index.html')));
  const listen = (server, port) => new Promise((resolve, reject) => { const l = server.listen(port, () => resolve(l)); l.on('error', reject); });
  const apiServer = await listen(app, 0), site = await listen(frontend, FRONT_PORT);
  const apiBase = `http://127.0.0.1:${apiServer.address().port}`;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const base = `http://localhost:${FRONT_PORT}`;
  const wavFile = path.join(out, 'sample-recording.wav');
  fs.writeFileSync(wavFile, samples.wav(8));

  // holdUploads: the student's recording upload is held (never answered) so the upload stays "in progress".
  async function open(viewport, token, url, { holdUploads = false } = {}) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: viewport.width, height: viewport.height });
    await page.evaluateOnNewDocument(jwt => { localStorage.setItem('backend_jwt', jwt); }, token);
    // QA only: the icon font (Boxicons, from a CDN) is blocked here, so the X glyph gets a plain stand-in to show where the button is.
    await page.evaluateOnNewDocument(() => document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '.bx-x::before{content:"\\00D7";font-family:Arial,sans-serif;font-style:normal;line-height:1}';
      document.head.appendChild(style);
    }));
    const seen = { console: [], calls: [], held: [], known: [] };
    page.on('console', msg => {
      if (msg.type() !== 'error') return;
      const text = msg.text().replace(/[a-f0-9]{24}/g, '<id>').slice(0, 220);
      (KNOWN_CONSOLE.test(text) ? seen.known : seen.console).push(text);
    });
    page.on('pageerror', error => seen.console.push(`pageerror: ${String(error.message).slice(0, 220)}`));
    await page.setRequestInterception(true);
    page.on('request', req => {
      const target = new URL(req.url());
      if (holdUploads && req.method() === 'POST' && /^\/api\/speaking\/[a-f0-9]{24}$/.test(target.pathname)) { seen.held.push(req); return; }
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
  const waitFor = async (fn, timeout = 20000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return true; await sleep(150); } return false; };
  const visible = (page, selector) => page.evaluate(s => [...document.querySelectorAll(s)].some(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed'), selector);
  const clickText = (page, selector, text) => page.evaluate((s, t) => {
    const el = [...document.querySelectorAll(s)].find(e => e.textContent.trim() === t && e.offsetParent !== null);
    if (!el) return false; el.click(); return true;
  }, selector, text);
  const overflow = page => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > document.documentElement.clientWidth + 1);
  const swalOpen = page => page.evaluate(() => !!document.querySelector('.swal2-container.swal2-backdrop-show, .swal2-container .swal2-popup.swal2-show'));
  const swalGone = page => waitFor(async () => !(await page.evaluate(() => !!document.querySelector('.swal2-container'))), 5000);
  const swalText = page => page.evaluate(() => {
    const t = s => document.querySelector(s)?.textContent?.trim() || '';
    return { title: t('.swal2-title'), text: t('.swal2-html-container'), confirm: t('.swal2-confirm'), cancel: t('.swal2-cancel') };
  });
  const shot = async (page, name, viewport) => {
    const file = `${name}-${viewport.name}.png`;
    await page.screenshot({ path: path.join(out, file) });
    report.screenshots.push(file);
  };
  const check = (viewport, name, ok, detail) => {
    report.checks.push({ viewport: viewport.name, name, ok: Boolean(ok), detail });
    if (!ok) report.failures.push(`${name}@${viewport.name}`);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}@${viewport.name}${ok ? '' : ` :: ${JSON.stringify(detail)}`}`);
  };
  const dialogSel = '[data-create-dialog] [role="dialog"]';
  const dialogOpen = page => visible(page, dialogSel);
  const dialogClosed = page => waitFor(async () => !(await dialogOpen(page)), 3000);
  const openCreate = async page => {
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find(b => ['Create Assignment', '+ Assignment'].includes(b.textContent.trim()) && b.offsetParent !== null);
      button?.focus(); button?.click();
    });
    return waitFor(() => visible(page, '.lt-choice-card'));
  };
  const focusIsCreateButton = page => waitFor(() => page.evaluate(() => ['Create Assignment', '+ Assignment'].includes(document.activeElement?.textContent?.trim())), 2000);
  const choose = async (page, kind) => {
    await page.evaluate(k => [...document.querySelectorAll(`[data-choice="${k}"]`)].find(e => e.offsetParent !== null)?.click(), kind);
    return waitFor(() => visible(page, kind === 'speaking' ? 'app-speaking-assignment-form input' : 'app-assignment-form:not(.hidden) input'));
  };
  const typeTitle = async (page, kind, value) => {
    const selector = kind === 'speaking' ? '#speaking-title' : 'app-assignment-form:not(.hidden) input[formcontrolname="className"]';
    await page.evaluate(s => [...document.querySelectorAll(s)].find(e => e.offsetParent !== null)?.focus(), selector);
    await page.keyboard.type(value);
  };
  const titleValue = (page, kind) => page.evaluate(s => [...document.querySelectorAll(s)].find(e => e.offsetParent !== null)?.value ?? null,
    kind === 'speaking' ? '#speaking-title' : 'app-assignment-form:not(.hidden) input[formcontrolname="className"]');
  const clickX = page => page.evaluate(() => [...document.querySelectorAll('[data-create-close]')].find(e => e.offsetParent !== null)?.click());
  const clickBackdrop = page => page.mouse.click(4, 4);
  const clickCancel = page => page.evaluate(() => [...document.querySelectorAll('[data-create-dialog] button')]
    .find(b => b.textContent.trim() === 'Cancel' && b.offsetParent !== null)?.click());

  for (const viewport of VIEWPORTS) {
    let context;
    try {
      const opened = await open(viewport, f.teacher.token, `/teacher/my-classes/detail/${C}`);
      context = opened.context;
      const page = opened.page;
      await waitFor(() => visible(page, '[data-speaking-pill]'), 40000);

      // 1. The choice step with the X; the dialog semantics; the page behind locked.
      await openCreate(page);
      await sleep(500);
      const a11y = await page.evaluate(sel => {
        const d = [...document.querySelectorAll(sel)].find(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed');
        const x = [...document.querySelectorAll('[data-create-close]')].find(e => e.offsetParent !== null);
        const chips = [...document.querySelectorAll('.lt-choice-chip')].filter(e => e.offsetParent !== null).map(e => e.textContent.trim());
        const panel = d?.getBoundingClientRect(), xr = x?.getBoundingClientRect(), title = document.getElementById(d?.getAttribute('aria-labelledby') || '');
        // The X: inside the panel, in its top-right corner, a 44 px target, not covering the title text.
        const tr = title?.getBoundingClientRect();
        const xPlaced = !!(panel && xr && xr.width >= 44 && xr.height >= 44 && xr.right <= panel.right + 1 && xr.right >= panel.right - 40
          && xr.top >= panel.top - 1 && xr.top <= panel.top + 40);
        const range = document.createRange(); if (title) range.selectNodeContents(title);
        const text = title ? range.getBoundingClientRect() : null;
        const overlapsTitle = !!(text && xr && !(xr.right <= text.left || xr.left >= text.right || xr.bottom <= text.top || xr.top >= text.bottom));
        return { modal: d?.getAttribute('aria-modal'), title: title?.textContent?.trim(), x: x?.getAttribute('aria-label'),
          locked: document.body.classList.contains('overflow-hidden'), chips, focus: document.activeElement?.id,
          focusedElement: `${document.activeElement?.tagName}.${String(document.activeElement?.className || '').slice(0, 40)} "${(document.activeElement?.textContent || '').trim().slice(0, 30)}"`,
          xPlaced, overlapsTitle,
          xBox: xr && { left: Math.round(xr.left), top: Math.round(xr.top), w: Math.round(xr.width) }, titleBox: tr && Math.round(tr.width) };
      }, dialogSel);
      await shot(page, 'choice-step-with-x', viewport);
      check(viewport, 'choice step: role dialog, aria-modal, labelled, X "Close" top-right (44 px, clear of the title), focus on the title, page locked, chips',
        a11y.modal === 'true' && a11y.title === 'Create Assignment' && a11y.x === 'Close' && a11y.locked && a11y.xPlaced && !a11y.overlapsTitle
          && a11y.focus?.startsWith('create-assignment-title-') && a11y.chips.join('|') === 'Handwritten or typed work|Recording up to 7 min', a11y);
      // Arrow keys move between the cards.
      await page.evaluate(() => [...document.querySelectorAll('[data-choice="writing"]')].find(e => e.offsetParent !== null)?.focus());
      await page.keyboard.press('ArrowRight');
      const arrowed = await page.evaluate(() => document.activeElement?.getAttribute('data-choice'));
      check(viewport, 'choice step: ArrowRight moves to Speaking', arrowed === 'speaking', { arrowed });

      // 2. Clean closes: X, Esc, backdrop; focus back on the create button.
      for (const [name, act] of [['X', clickX], ['Esc', p => p.keyboard.press('Escape')], ['backdrop', clickBackdrop]]) {
        if (!(await dialogOpen(page))) await openCreate(page);
        await sleep(350);
        await act(page);
        const closed = await dialogClosed(page);
        const focused = await focusIsCreateButton(page);
        const unlocked = await page.evaluate(() => !document.body.classList.contains('overflow-hidden'));
        check(viewport, `choice step: ${name} closes at once, focus returns, page unlocked`, closed && focused && unlocked && !(await swalOpen(page)), { closed, focused, unlocked });
      }
      await shot(page, 'clean-close', viewport);

      // 3. Dirty speaking form: Esc shows the SweetAlert above the dialog; Esc inside it closes only the SweetAlert; double click on Discard.
      await openCreate(page); await choose(page, 'speaking'); await typeTitle(page, 'speaking', 'Describe your town');
      await page.keyboard.press('Escape');
      await waitFor(() => swalOpen(page), 5000);
      await sleep(400);
      const layering = await page.evaluate(() => {
        const swal = document.querySelector('.swal2-container');
        const host = [...document.querySelectorAll('[data-create-dialog] .fixed.inset-0')].find(e => getComputedStyle(e).position === 'fixed');
        const button = document.querySelector('.swal2-confirm');
        const r = button.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { swalZ: getComputedStyle(swal).zIndex, dialogZ: host ? getComputedStyle(host).zIndex : null, hitIsSwal: !!hit?.closest('.swal2-container') };
      });
      const words = await swalText(page);
      await shot(page, 'speaking-dirty-sweetalert', viewport);
      check(viewport, 'speaking dirty: "Discard changes?" with Discard / Keep editing, above the dialog',
        words.title === 'Discard changes?' && words.text === 'You have unsaved changes to this assignment. If you close now, they will be lost.'
          && words.confirm === 'Discard' && words.cancel === 'Keep editing' && layering.hitIsSwal && Number(layering.swalZ) > Number(layering.dialogZ), { words, layering });
      await page.keyboard.press('Escape');
      await swalGone(page);
      await sleep(300);
      await sleep(400); // past SweetAlert's own 100 ms focus restore, so a late steal would show
      const afterEsc = { open: await dialogOpen(page), title: await titleValue(page, 'speaking'), swal: await swalOpen(page),
        focusBack: await page.evaluate(() => document.activeElement?.id) };
      check(viewport, 'speaking dirty: Esc inside the SweetAlert closes only the SweetAlert (dialog, input and focus kept)',
        afterEsc.open && afterEsc.title === 'Describe your town' && !afterEsc.swal && afterEsc.focusBack === 'speaking-title', afterEsc);
      await clickX(page);
      await waitFor(() => swalOpen(page), 5000); await sleep(400);
      const confirmBox = await page.evaluate(() => { const r = document.querySelector('.swal2-confirm').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      const urlBefore = page.url();
      // What lies under the Discard button once the SweetAlert has gone (a real second click of a double click may land there).
      await page.mouse.click(confirmBox.x, confirmBox.y);
      await page.mouse.click(confirmBox.x, confirmBox.y);
      await swalGone(page);
      await sleep(400); // past SweetAlert's own 100 ms focus restore
      const afterDiscard = { closed: await dialogClosed(page), swal: await swalOpen(page), sameUrl: page.url() === urlBefore,
        otherDialog: await page.evaluate(() => [...document.querySelectorAll('[role="dialog"], .upload-dialog, .fixed.inset-0')].some(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed')),
        secondClickLandedOn: await page.evaluate((x, y) => { const e = document.elementFromPoint(x, y); return `${e?.tagName}.${String(e?.className || '').slice(0, 30)}`; }, confirmBox.x, confirmBox.y) };
      check(viewport, 'speaking dirty: double click on Discard closes once (no second prompt, nothing else opened, no navigation)',
        afterDiscard.closed && !afterDiscard.swal && afterDiscard.sameUrl && !afterDiscard.otherDialog, afterDiscard);
      await openCreate(page); await choose(page, 'speaking');
      check(viewport, 'speaking: reopened form is empty', (await titleValue(page, 'speaking')) === '', {});
      await clickCancel(page);
      check(viewport, 'speaking clean: Cancel closes at once', (await dialogClosed(page)) && !(await swalOpen(page)), {});

      // 4. Dirty writing form: Cancel -> Keep editing keeps the input; X -> Discard closes; reopening shows an empty form.
      await openCreate(page); await choose(page, 'writing'); await typeTitle(page, 'writing', 'River essay draft');
      await clickCancel(page);
      await waitFor(() => swalOpen(page), 5000); await sleep(300);
      await shot(page, 'writing-dirty-sweetalert', viewport);
      await page.evaluate(() => document.querySelector('.swal2-cancel')?.click());
      await swalGone(page);
      const kept = { open: await dialogOpen(page), title: await titleValue(page, 'writing') };
      check(viewport, 'writing dirty: Cancel -> Keep editing keeps the dialog and the input', kept.open && kept.title === 'River essay draft', kept);
      await clickX(page);
      await waitFor(() => swalOpen(page), 5000); await sleep(300);
      await page.evaluate(() => document.querySelector('.swal2-confirm')?.click());
      await swalGone(page);
      const discarded = await dialogClosed(page);
      await sleep(400); // past SweetAlert's own 100 ms focus restore
      const focusReturned = await focusIsCreateButton(page);
      await openCreate(page); await choose(page, 'writing');
      const emptyAgain = (await titleValue(page, 'writing')) === '';
      check(viewport, 'writing dirty: X -> Discard closes, focus back on the create button; reopened writing form is empty',
        discarded && focusReturned && emptyAgain, { discarded, focusReturned, emptyAgain });
      await clickX(page);
      check(viewport, 'writing clean: X closes at once', (await dialogClosed(page)) && !(await swalOpen(page)), {});

      // 5. Teacher "Upload work" (speaking card): students entered, backdrop -> SweetAlert -> Keep editing; Esc -> SweetAlert -> Discard closes.
      await sleep(400);
      await page.evaluate(() => { const b = [...document.querySelectorAll('[data-speaking-upload]')].find(e => e.offsetParent !== null); b?.focus(); b?.click(); });
      if (await waitFor(() => visible(page, '.upload-dialog'))) {
        await page.evaluate(() => {
          const input = document.querySelector('.upload-dialog .upload-student-row input');
          input.value = 'Dee Student'; input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.mouse.click(4, 4);
        await waitFor(() => swalOpen(page), 5000); await sleep(300);
        const teacherWords = await swalText(page);
        await shot(page, 'teacher-upload-dirty-sweetalert', viewport);
        await page.evaluate(() => document.querySelector('.swal2-cancel')?.click());
        await swalGone(page);
        const stillOpen = await visible(page, '.upload-dialog');
        await page.keyboard.press('Escape');
        await waitFor(() => swalOpen(page), 5000); await sleep(300);
        await page.evaluate(() => document.querySelector('.swal2-confirm')?.click());
        await swalGone(page);
        const teacherClosed = await waitFor(async () => !(await visible(page, '.upload-dialog')), 3000);
        await sleep(400);
        const teacherFocus = await page.evaluate(() => document.activeElement?.hasAttribute('data-speaking-upload') ?? false);
        check(viewport, 'teacher upload: backdrop asks (SweetAlert), Keep editing stays, Esc -> Discard closes, focus back on "Upload work"',
          teacherWords.title === 'Discard the student recordings you added?' && teacherWords.confirm === 'Discard' && teacherWords.cancel === 'Keep editing' && stillOpen
            && teacherClosed && teacherFocus, { teacherWords, stillOpen, teacherClosed, teacherFocus });
      } else check(viewport, 'teacher upload: dialog opened', false, {});

      report.knownConsole.push(...opened.seen.known.map(t => `${viewport.name} teacher: ${t}`));
      check(viewport, 'teacher page: no console errors, no failed calls, no horizontal overflow',
        !opened.seen.console.length && !opened.seen.calls.length && !(await overflow(page)), { console: opened.seen.console, calls: opened.seen.calls });
    } catch (error) {
      check(viewport, 'teacher flow ran', false, { error: String(error?.message || error).slice(0, 300) });
    } finally { await context?.close().catch(() => {}); }

    // 6. Student upload dialog: a chosen file (X -> Keep file, then Discard); an upload held in progress (X -> "Stop the upload?").
    try {
      const opened = await open(viewport, f.student.token, `/student/my-classes/detail/${C}`, { holdUploads: true });
      context = opened.context;
      const page = opened.page;
      await waitFor(() => visible(page, '[data-speaking-pill]'), 40000);
      const openUpload = async () => {
        await clickText(page, 'button', 'Upload Recording');
        if (!await waitFor(() => visible(page, '[data-speaking-dropzone]'))) return false;
        const input = await page.$('app-speaking-upload-dialog input[type=file]');
        await input.uploadFile(wavFile);
        return waitFor(() => page.evaluate(() => document.body.innerText.includes('sample-recording.wav')));
      };
      const uploadOpen = () => visible(page, '.upload-modal-header');
      await openUpload();
      await page.evaluate(() => document.querySelector('button[aria-label="Close upload dialog"]')?.click());
      await waitFor(() => swalOpen(page), 5000); await sleep(300);
      const fileWords = await swalText(page);
      await shot(page, 'student-file-sweetalert', viewport);
      await page.evaluate(() => document.querySelector('.swal2-cancel')?.click());
      await swalGone(page);
      const keptFile = (await uploadOpen()) && await page.evaluate(() => document.body.innerText.includes('sample-recording.wav'));
      await page.evaluate(() => document.querySelector('button[aria-label="Close upload dialog"]')?.click());
      await waitFor(() => swalOpen(page), 5000); await sleep(300);
      await page.evaluate(() => document.querySelector('.swal2-confirm')?.click());
      await swalGone(page);
      const fileClosed = await waitFor(async () => !(await uploadOpen()), 3000);
      check(viewport, 'student upload: chosen file asks "Discard the selected file?"; Keep file keeps it; Discard closes',
        fileWords.title === 'Discard the selected file?' && fileWords.text === 'The file has not been uploaded yet.' && fileWords.confirm === 'Discard'
          && fileWords.cancel === 'Keep file' && keptFile && fileClosed, { fileWords, keptFile, fileClosed });

      await openUpload();
      await page.evaluate(() => [...document.querySelectorAll('app-speaking-upload-dialog button')].find(b => b.textContent.includes('Upload Recording') && !b.disabled)?.click());
      await waitFor(async () => opened.seen.held.length > 0, 5000);
      await page.keyboard.press('Escape'); await page.mouse.click(4, 4); await sleep(400);
      const blocked = (await uploadOpen()) && !(await swalOpen(page));
      await page.evaluate(() => document.querySelector('button[aria-label="Close upload dialog"]')?.click());
      await waitFor(() => swalOpen(page), 5000); await sleep(300);
      const stopWords = await swalText(page);
      await shot(page, 'student-upload-in-progress-sweetalert', viewport);
      await page.evaluate(() => document.querySelector('.swal2-confirm')?.click());
      await swalGone(page);
      const stopped = await waitFor(async () => !(await uploadOpen()), 3000);
      check(viewport, 'student upload in progress: Esc/backdrop ignored; X asks "Stop the upload?"; Stop upload closes',
        blocked && stopWords.title === 'Stop the upload?' && stopWords.text === 'The upload is still in progress. If you close now, it will be cancelled.'
          && stopWords.confirm === 'Stop upload' && stopWords.cancel === 'Keep uploading' && stopped, { blocked, stopWords, stopped });
      for (const req of opened.seen.held) await req.abort().catch(() => {});
      // A cancelled upload is reported by the browser as an aborted request (net::ERR_FAILED / ERR_ABORTED), filtered as known.
      report.knownConsole.push(...opened.seen.known.map(t => `${viewport.name} student: ${t}`));
      check(viewport, 'student page: no console errors, no failed calls, no horizontal overflow',
        !opened.seen.console.length && !opened.seen.calls.length && !(await overflow(page)), { console: opened.seen.console, calls: opened.seen.calls });
    } catch (error) {
      check(viewport, 'student flow ran', false, { error: String(error?.message || error).slice(0, 300) });
    } finally { await context?.close().catch(() => {}); }
  }

  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\n${report.checks.length} checks, ${report.failures.length} failing; ${report.screenshots.length} screenshots in ${out}`);
  await browser.close(); apiServer.close(); site.close();
  await disconnectInMemoryMongo();
  fs.rmSync(uploadRoot, { recursive: true, force: true });
  process.exit(report.failures.length ? 1 : 0);
})().catch(error => {
  console.error('qa-create-dialog-close failed:', error);
  process.exit(2);
});
