'use strict';
// The sync checks of qa-highlight-sync.cjs: click, hover and keyboard in each of the three views, positions, scrolling, hidden and orphan items,
// two files with a rotated image, 300 corrections, downloads and listeners. Results and screenshots go to the output directory.
const fs = require('fs');
const path = require('path');

module.exports = async function run({ out, seedAll, harness, teacherUrl, sleep, signTestJwt, connectInMemoryMongo, seedTestPlans, Submission }) {
  fs.mkdirSync(out, { recursive: true });
  const report = { steps: [], failures: [], timings: {}, consoleErrors: {}, failedCalls: {} };
  const check = (name, ok, detail) => { report.steps.push({ name, ok: Boolean(ok), ...(detail !== undefined ? { detail } : {}) }); if (!ok) report.failures.push(name); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail !== undefined ? `  -> ${JSON.stringify(detail).slice(0, 400)}` : ''}`); };
  await connectInMemoryMongo(); await seedTestPlans();
  const { fixture, api, big, multi, pdf, orphan, noBox } = await seedAll();
  const h = await harness(path.resolve(__dirname, '../dist/rozna-comarker-fe/browser'), report);
  const jwt = signTestJwt({ id: fixture.teacher._id, role: 'teacher', firebaseUid: fixture.teacher.firebaseUid });
  const id = fixture.IDS.registered;
  const snapshot = (await api.snapshot(id)).body.data;
  const quote = (q, n = 0) => snapshot.corrections.filter(c => c.quotedText === q)[n];
  const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`) });

  async function openWorkspace(label, studentId, submissionId, options) {
    const t = await h.open(label, jwt, teacherUrl(h.base, fixture, studentId, submissionId), 'app-annotation-controls', options);
    await t.page.waitForSelector('[aria-controls="annotation-editor-body"]', { timeout: 60000 });
    await sleep(1500);
    await t.page.click('[aria-controls="annotation-editor-body"]');
    await t.page.waitForSelector('[data-sync-toggle]', { timeout: 60000 });
    return t;
  }
  const showWorkspace = async page => {
    await page.click('[data-sync-toggle]');
    await page.waitForSelector('app-review-workspace img.is-loaded', { timeout: 60000 });
    await page.waitForSelector('app-review-workspace .correction-overlay__marker', { timeout: 60000 }).catch(() => {});
    await sleep(500);
  };
  /** Which correction each of the three views shows as active. */
  const views = page => page.evaluate(() => {
    const words = [...document.querySelectorAll('app-review-workspace app-tokenized-transcript .is-sync-active')].map(el => el.textContent.trim());
    const marker = document.querySelector('app-review-workspace .correction-overlay__marker.is-sync-active');
    const row = document.querySelector('.row--active');
    return { transcript: words.join(' '), marker: marker?.textContent.trim() ?? null, row: row?.getAttribute('data-row-key') ?? null, status: document.querySelector('[data-sync-status]')?.textContent.replace(/\s+/g, ' ').trim() ?? '', live: document.querySelector('[data-sync-live]')?.textContent.trim() ?? '' };
  });
  const clear = async page => { await page.keyboard.press('Escape'); await sleep(100); await page.evaluate(() => document.querySelector('[data-sync-clear]')?.click()); await sleep(200); };
  const rowSel = key => `[data-row-key="${key}"]`;
  const clickRow = (page, key) => page.evaluate(sel => document.querySelector(sel).querySelector('blockquote, .row__title').click(), rowSel(key));
  const inPanel = (page, panel, target) => page.evaluate((p, t) => { const a = document.querySelector(p).getBoundingClientRect(), b = document.querySelector(t)?.getBoundingClientRect(); return b ? b.top >= a.top - 1 && b.bottom <= a.bottom + 1 : null; }, panel, target);

  try {
    // Main submission: 2 visible AI, 1 teacher, 2 hidden, 1 removed.
    const a = await openWorkspace('teacher-main', fixture.student._id, id);
    await a.page.waitForFunction(() => [...document.querySelectorAll('img')].some(i => i.src.startsWith('blob:') && i.complete && i.naturalWidth > 0), { timeout: 60000 });
    const imagesBefore = a.seen.imageRequests.length;
    check('the page itself downloaded the image (so the next check counts something real)', imagesBefore >= 1, a.seen.imageRequests);
    report.timings.pageImageDownloadsBeforeOpening = imagesBefore;
    check('closed: the workspace does not exist', !(await a.page.$('app-review-workspace')));
    await showWorkspace(a.page);
    check('opening downloads no image again', a.seen.imageRequests.length === imagesBefore, a.seen.imageRequests.slice(imagesBefore));
    const sameUrl = await a.page.evaluate(() => { const imgs = [...document.querySelectorAll('img')].filter(i => i.src.startsWith('blob:')).map(i => i.src); return { count: imgs.length, unique: new Set(imgs).size }; });
    check('the page view and the workspace show the same object URL', sameUrl.count === 2 && sameUrl.unique === 1, sameUrl);
    await shot(a.page, '01-open');

    const visible = quote('goes'), hidden = quote('dont'), removed = quote('realy'), mismatch = quote('a');
    const manual = snapshot.corrections.find(c => c.quotedText === 'park');
    // All three views must be on screen together, or a view scrolls where nobody can see it.
    await a.page.evaluate(() => document.querySelector('app-review-workspace').scrollIntoView({ block: 'start' })); await sleep(200);
    const inWindow = sel => a.page.evaluate(q => { const r = document.querySelector(q).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; }, sel);
    const fits = { image: await inWindow('[data-sync-image]'), transcript: await inWindow('[data-sync-transcript]'), list: await inWindow('ul.rows') };
    check('at 1500x1100: image, transcript and list fit the window together', fits.image && fits.transcript && fits.list, fits);
    // From the list.
    await clickRow(a.page, visible.id); await sleep(400);
    let v = await views(a.page);
    // The layout may share one badge between nearby corrections ("AGR·SP"), so the badge must hold this correction's symbol.
    check('list click: transcript, image and list agree', v.transcript === 'goes' && String(v.marker).split('·').includes('AGR') && v.row === visible.id, v);
    check('list click: announced in the live region', /Selected AGR, goes, page 1, visible to the student/.test(v.live), v.live);
    await shot(a.page, '02-list-click');
    await clear(a.page);
    v = await views(a.page);
    check('clears everywhere', !v.transcript && !v.marker && !v.row && !v.live, v);
    // From the transcript.
    await a.page.click(`app-review-workspace app-tokenized-transcript [data-word-id$="_1_6"], app-review-workspace [data-sync-transcript] .correction-highlight`); await sleep(400);
    v = await views(a.page);
    check('transcript click: image and list agree', Boolean(v.transcript) && Boolean(v.marker) && Boolean(v.row), v);
    await clear(a.page);
    // From the image. Hover first (mouse), then click.
    const firstMarker = await a.page.$('app-review-workspace .correction-overlay__marker');
    await firstMarker.hover(); await sleep(350);
    v = await views(a.page);
    check('image hover: transcript and list follow, not announced', Boolean(v.transcript) && Boolean(v.row) && !v.live, v);
    check('image hover: no tooltip in the workspace', await a.page.evaluate(() => !document.querySelector('app-review-workspace .correction-overlay__tooltip.is-open')));
    await a.page.mouse.move(2, 2); await sleep(350);
    v = await views(a.page);
    check('hover end: back to nothing', !v.transcript && !v.marker && !v.row, v);
    await firstMarker.click(); await sleep(400);
    v = await views(a.page);
    check('image click: pinned in all three', Boolean(v.transcript) && Boolean(v.marker) && Boolean(v.row) && Boolean(v.live), v);
    await a.page.mouse.move(2, 2); await sleep(350);
    check('pinned stays after the pointer leaves', Boolean((await views(a.page)).row));
    await clear(a.page);
    // A badge shared by several corrections: each click moves to the next one, and it comes back round.
    const shared = await a.page.evaluateHandle(() => [...document.querySelectorAll('app-review-workspace .correction-overlay__marker')].find(m => m.textContent.includes('·')));
    if (shared.asElement()) {
      const seenRows = [];
      for (let i = 0; i < 3; i++) { await shared.asElement().click(); await sleep(350); seenRows.push((await views(a.page)).row); }
      check('shared badge: clicks walk through its corrections and come back', seenRows[0] && seenRows[1] && seenRows[0] !== seenRows[1] && seenRows[2] === seenRows[0], seenRows);
      await shot(a.page, '02b-shared-badge');
      await clear(a.page);
    } else check('shared badge: the fixture has one', false);
    // Keyboard, in each view.
    await a.page.focus('app-review-workspace .correction-overlay__marker');
    await a.page.keyboard.press('Tab'); await a.page.keyboard.down('Shift'); await a.page.keyboard.press('Tab'); await a.page.keyboard.up('Shift'); await sleep(400);
    v = await views(a.page);
    check('keyboard focus on a marker: all three', Boolean(v.transcript) && Boolean(v.row) && Boolean(v.live), v);
    await a.page.keyboard.press('Escape'); await sleep(200);
    check('Escape clears', !(await views(a.page)).row);
    await a.page.focus('app-review-workspace [data-sync-transcript] .correction-highlight');
    await a.page.keyboard.press('Tab'); await a.page.keyboard.down('Shift'); await a.page.keyboard.press('Tab'); await a.page.keyboard.up('Shift'); await sleep(400);
    v = await views(a.page);
    check('keyboard focus on a transcript word: all three', Boolean(v.marker) && Boolean(v.row), v);
    await a.page.keyboard.press('Escape'); await sleep(200);
    await a.page.focus(rowSel(visible.id));
    await a.page.keyboard.press('Tab'); await a.page.keyboard.down('Shift'); await a.page.keyboard.press('Tab'); await a.page.keyboard.up('Shift'); await sleep(400);
    v = await views(a.page);
    check('keyboard focus on a list row: all three', v.row === visible.id && v.transcript === 'goes', v);
    await clear(a.page);
    // States and the safety check.
    const labels = key => a.page.$eval(rowSel(key), el => [...el.querySelectorAll('[data-row-position]')].map(b => b.textContent.trim()));
    check('hidden, words match: labelled in text', (await labels(hidden.id)).join() === 'Approximate position', await labels(hidden.id));
    check('removed, words match: labelled in text', (await labels(removed.id)).join() === 'Approximate position', await labels(removed.id));
    check('hidden, stored words read differently: no position, nothing drawn', (await labels(mismatch.id)).includes('Not located on image'), await labels(mismatch.id));
    check('visible: no label', (await labels(visible.id)).length === 0, await labels(visible.id));
    check('teacher correction has its server position', (await labels(manual.id)).length === 0, await labels(manual.id));
    await clickRow(a.page, hidden.id); await sleep(400);
    v = await views(a.page);
    check('hidden item syncs, and says approximate', v.transcript === 'dont' && Boolean(v.marker) && /Approximate position/.test(v.status) && /hidden from the student/.test(v.live), v);
    check('a badge shared with a visible correction does not read as hidden', await a.page.evaluate(() => !document.querySelector('app-review-workspace .correction-overlay__marker.is-sync-active').hasAttribute('data-sync-state')));
    check('hidden item: its own underline carries the state', await a.page.evaluate(() => document.querySelector('app-review-workspace .correction-overlay__underline.is-selected')?.getAttribute('data-sync-state') === 'hidden'));
    check('the legend explains dashed marks in words', /approximate position/.test(await a.page.$eval('[data-sync-legend]', el => el.textContent)));
    await shot(a.page, '03-hidden-approximate');
    await clickRow(a.page, removed.id); await sleep(400);
    v = await views(a.page);
    check('removed item syncs', v.transcript === 'realy' && Boolean(v.marker) && /removed/.test(v.live), v);
    check('a badge only of a removed item: its state is a style and a word', await a.page.evaluate(() => { const m = document.querySelector('app-review-workspace .correction-overlay__marker.is-sync-active'); return m.getAttribute('data-sync-state') === 'archived' && /removed, approximate position/.test(m.getAttribute('aria-label')); }));
    await clickRow(a.page, mismatch.id); await sleep(400);
    v = await views(a.page);
    check('failed check: selected in the list, nothing drawn or marked, says why', v.row === mismatch.id && !v.marker && !v.transcript && /Not located on image/.test(v.status), v);
    await shot(a.page, '04-no-position');
    await clear(a.page);
    // Saving still works with the workspace open; the moved row keeps its place.
    await a.page.evaluate(sel => [...document.querySelector(sel).querySelectorAll('button')].find(b => b.textContent.trim().startsWith('Hide')).click(), rowSel(visible.id));
    await a.page.waitForFunction(sel => /Hidden from student/.test(document.querySelector(sel)?.textContent || ''), { timeout: 20000 }, rowSel(visible.id));
    await sleep(600);
    check('hide with the workspace open: the item becomes approximate', (await labels(visible.id)).join() === 'Approximate position', await labels(visible.id));
    // Closing frees it.
    await a.page.click('[data-sync-toggle]'); await sleep(300);
    const closed = await a.page.evaluate(() => ({ workspace: !!document.querySelector('app-review-workspace'), labels: document.querySelectorAll('[data-row-position]').length, tab: document.querySelector('[data-row-key]').getAttribute('tabindex'), blob: [...document.querySelectorAll('img')].filter(i => i.src.startsWith('blob:')).length }));
    check('closing removes the workspace; the page image stays', !closed.workspace && closed.tab === '-1' && closed.blob === 1, closed);
    // Opening and closing repeatedly leaves no listeners or nodes behind.
    const client = await a.page.createCDPSession();
    // Garbage collection runs when it likes, so a leak is what keeps growing: compare after more and more cycles, not with the very start.
    const metrics = async () => { for (let i = 0; i < 3; i++) { await client.send('HeapProfiler.collectGarbage'); await sleep(250); } const m = await a.page.metrics(); return { listeners: m.JSEventListeners, nodes: m.Nodes, heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(2) }; };
    const cycles = async n => { for (let i = 0; i < n; i++) { await a.page.click('[data-sync-toggle]'); await sleep(300); await a.page.click('[data-sync-toggle]'); await sleep(120); } return metrics(); };
    const start = await metrics(), after5 = await cycles(5), after15 = await cycles(10), after30 = await cycles(15);
    check('30 open and close cycles: listeners return exactly', after30.listeners === start.listeners, { start, after30 });
    check('30 open and close cycles: nodes and memory do not keep growing', after30.nodes - after5.nodes <= 300 && after30.heapMB - after5.heapMB <= 2, { start, after5, after15, after30 });
    report.timings.openCloseCycles = { start, after5, after15, after30 };
    await a.context.close();

    // Two files, one EXIF-rotated: a selection on the other file moves to it.
    const m = await openWorkspace('teacher-two-files', multi.studentId, multi.id);
    await showWorkspace(m.page);
    const multiSnap = (await api.snapshot(multi.id)).body.data;
    check('two files: the page control shows', /Page 1 of 2/.test(await m.page.$eval('[data-sync-page]', el => el.textContent)));
    const span = multiSnap.corrections.find(c => c.quotedText.split(' ').length === 4);
    await clickRow(m.page, span.id); await sleep(400);
    v = await views(m.page);
    check('multi-box span: every word marked, one active marker', v.transcript === span.quotedText && Boolean(v.marker), v);
    const segments = await m.page.evaluate(() => document.querySelectorAll('app-review-workspace .correction-overlay__underline.is-selected').length);
    check('span across a line: more than one underline segment', segments >= 2, segments);
    await shot(m.page, '05-span-over-lines');
    const fetchesBefore = m.seen.imageRequests.length;
    const other = multiSnap.corrections.find(c => c.fileId !== span.fileId);
    await clickRow(m.page, other.id);
    await m.page.waitForFunction(() => /Page 2 of 2/.test(document.querySelector('[data-sync-page]')?.textContent || ''), { timeout: 30000 });
    await m.page.waitForSelector('app-review-workspace .correction-overlay__marker.is-sync-active', { timeout: 30000 });
    await sleep(500);
    v = await views(m.page);
    check('moving to the other file keeps the workspace on screen', await m.page.evaluate(() => { const r = document.querySelector('[data-sync-image]').getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }));
    check('a correction on the other file moves there and syncs', v.transcript === other.quotedText && Boolean(v.marker), v);
    check('the other file is fetched once', m.seen.imageRequests.length - fetchesBefore === 1, m.seen.imageRequests.slice(fetchesBefore));
    const rotated = await m.page.evaluate(() => { const img = document.querySelector('app-review-workspace img'); const u = document.querySelector('app-review-workspace .correction-overlay__underline.is-selected'); const iw = img.getBoundingClientRect(), ub = u?.getBoundingClientRect(); return { natural: [img.naturalWidth, img.naturalHeight], x: ub ? (ub.left - iw.left) / iw.width : null, y: ub ? (ub.top - iw.top) / iw.height : null }; });
    // "ask" is word 5 on line 1 in encoded axes (x 35..41.5, y 4..6.6): EXIF 6 turns it into x 93.4..96, y 35..41.5.
    check('rotated image: EXIF applied, and the mark lands where the rotation puts the word', rotated.natural[0] === 900 && rotated.natural[1] === 1200 && rotated.x > 0.9 && rotated.x < 0.98 && rotated.y > 0.3 && rotated.y < 0.45, rotated);
    await shot(m.page, '06-rotated');
    await m.context.close();

    // PDF: the page view has already downloaded page 1; the workspace must not repeat it.
    const p = await openWorkspace('teacher-pdf', pdf.studentId, pdf.id);
    await p.page.waitForFunction(() => [...document.querySelectorAll('app-submission-page-review img')].some(i => i.complete && i.src.startsWith('blob:')), { timeout: 60000 });
    const pagesBefore = p.seen.imageRequests.filter(u => u.startsWith('/files/'));
    check('PDF: the page view downloaded its page once', pagesBefore.length === 1, pagesBefore);
    await showWorkspace(p.page);
    const pdfSeen = () => p.seen.imageRequests.filter(u => u.startsWith('/files/'));
    check('PDF: opening the workspace downloads nothing more', pdfSeen().length === 1, pdfSeen());
    const shared2 = await p.page.evaluate(() => { const imgs = [...document.querySelectorAll('img')].filter(i => i.src.startsWith('blob:')).map(i => i.src); return { count: imgs.length, unique: new Set(imgs).size }; });
    check('PDF: both views show one object URL', shared2.count === 2 && shared2.unique === 1, shared2);
    const pdfSnap = (await api.snapshot(pdf.id)).body.data;
    const onPage2 = pdfSnap.corrections.find(c => c.page === 2), onPage1 = pdfSnap.corrections.find(c => c.page === 1);
    await clickRow(p.page, onPage2.id);
    await p.page.waitForFunction(() => /Page 2 of 2/.test(document.querySelector('[data-sync-page]')?.textContent || ''), { timeout: 30000 });
    await p.page.waitForSelector('app-review-workspace .correction-overlay__marker.is-sync-active', { timeout: 30000 });
    await sleep(400);
    v = await views(p.page);
    check('PDF: a correction on page 2 moves the image there and syncs', v.transcript === onPage2.quotedText && Boolean(v.marker) && v.row === onPage2.id, v);
    check('PDF: page 2 is downloaded once', pdfSeen().length === 2, pdfSeen());
    await shot(p.page, '05b-pdf-page-2');
    await clickRow(p.page, onPage1.id);
    await p.page.waitForFunction(() => /Page 1 of 2/.test(document.querySelector('[data-sync-page]')?.textContent || ''), { timeout: 30000 });
    await p.page.waitForSelector('app-review-workspace .correction-overlay__marker.is-sync-active', { timeout: 30000 });
    await sleep(300);
    check('PDF: back on page 1 nothing is downloaded (the page view still holds it)', pdfSeen().length === 2, pdfSeen());
    await p.page.click('[data-sync-toggle]'); await sleep(300);
    const afterClose = await p.page.evaluate(() => [...document.querySelectorAll('app-submission-page-review img')].map(i => ({ ok: i.complete && i.naturalWidth > 0 })));
    check('PDF: closing the workspace leaves the page view working', afterClose.length === 1 && afterClose[0].ok, afterClose);
    await p.context.close();

    // An orphan, and a visible correction on a word with no box.
    const o = await openWorkspace('teacher-orphan', orphan.studentId, orphan.id);
    await showWorkspace(o.page);
    const orphanRow = await o.page.$eval('[data-row-key^="orphan:"]', el => ({ key: el.getAttribute('data-row-key'), labels: [...el.querySelectorAll('[data-row-position]')].map(b => b.textContent.trim()), text: el.textContent })).catch(() => null);
    check('orphan: listed with its state, no position on the image or in the transcript', orphanRow && orphanRow.labels.join() === 'Not located on image,Not in the transcript' && /Needs review/.test(orphanRow.text), orphanRow);
    if (orphanRow) {
      await clickRow(o.page, orphanRow.key); await sleep(400);
      v = await views(o.page);
      check('orphan: selecting it marks nothing elsewhere and says why', v.row === orphanRow.key && !v.marker && !v.transcript && /Not located on image/.test(v.status), v);
      await shot(o.page, '05c-orphan');
    }
    await o.context.close();
    const n = await openWorkspace('teacher-no-box', noBox.studentId, noBox.id);
    await showWorkspace(n.page);
    const noBoxRows = await n.page.$$eval('[data-row-key]', rows => rows.map(el => ({ quote: el.querySelector('blockquote')?.textContent, labels: [...el.querySelectorAll('[data-row-position]')].map(b => b.textContent.trim()) })));
    const homeless = noBoxRows.find(r => r.labels.includes('Not located on image'));
    report.timings.noBoxRows = noBoxRows;
    check('a correction whose word has no box says so; the others do not', Boolean(homeless) && noBoxRows.filter(r => !r.labels.length).length > 0, noBoxRows);
    await n.context.close();

    // A narrower window and touch: tap selects, nothing depends on hover.
    const t = await openWorkspace('teacher-touch', fixture.student._id, id, { width: 820, height: 1180, touch: true });
    await showWorkspace(t.page);
    await t.page.tap('app-review-workspace .correction-overlay__marker'); await sleep(500);
    v = await views(t.page);
    const tabletFit = await t.page.evaluate(() => { document.querySelector('app-review-workspace').scrollIntoView({ block: 'start' }); const r = q => document.querySelector(q).getBoundingClientRect(); return { top: r('[data-sync-image]').top, bottom: r('ul.rows').bottom, height: innerHeight }; });
    await sleep(100);
    check('at 820x1180 (tablet, one column): all three fit the window together', tabletFit.top >= 0 && tabletFit.bottom <= tabletFit.height + 1, tabletFit);
    check('touch: a tap pins in all three, and no sheet opens', Boolean(v.row) && Boolean(v.transcript) && await t.page.evaluate(() => !document.querySelector('app-review-workspace .correction-overlay__tooltip.is-open') && !document.querySelector('.correction-overlay__backdrop')), v);
    await shot(t.page, '07-tablet-touch');
    await t.context.close();

    // 300 corrections, and reduced motion.
    const b = await openWorkspace('teacher-300', big.studentId, big.id, { reducedMotion: true });
    const openStart = Date.now();
    await showWorkspace(b.page);
    report.timings.openWorkspace300ms = Date.now() - openStart - 500;
    const bigSnap = (await api.snapshot(big.id)).body.data;
    const counts = await b.page.evaluate(() => ({ markers: document.querySelectorAll('app-review-workspace .correction-overlay__marker').length, words: document.querySelectorAll('[data-word-id]').length, rows: document.querySelectorAll('[data-row-key]').length }));
    check('300 corrections: list capped at 50 rows, every word in the transcript, badges shared by the existing layout', counts.rows === 50 && counts.markers > 0 && counts.words === 1500, counts);
    check('300 corrections: every one of them is marked in the transcript', await b.page.evaluate(() => document.querySelectorAll('[data-sync-transcript] .correction-highlight').length === 300));
    check('300 corrections: no shown row claims a missing position', await b.page.evaluate(() => !document.querySelector('[data-row-position]')));
    // Every drawn underline or badge together must cover all 300: ask the page which rows it cannot place after showing them all.
    while (await b.page.evaluate(() => { const more = [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith('Show more')); more?.click(); return Boolean(more); })) await sleep(120);
    await sleep(300);
    const allRows = await b.page.evaluate(() => ({ rows: document.querySelectorAll('[data-row-key]').length, unplaced: document.querySelectorAll('[data-row-position]').length }));
    check('300 corrections: all 300 rows are placed on the image', allRows.rows === 300 && allRows.unplaced === 0, allRows);
    report.timings.allRows300 = allRows;
    report.timings.counts300 = counts;
    // Listeners per word: the words carry none.
    const wordListeners = await (async () => { const cdp = await b.page.createCDPSession(); const { result } = await cdp.send('Runtime.evaluate', { expression: 'document.querySelector("[data-word-id]")' }); const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId }); return listeners.length; })();
    check('300 corrections: a transcript word has no listener of its own', wordListeners === 0, wordListeners);
    const timed = async (name, act) => { const samples = []; for (const key of act.keys) { samples.push(await b.page.evaluate(k => new Promise(resolve => { const start = performance.now(); document.querySelector(`[data-row-key="${k}"]`).querySelector('blockquote').click(); requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - start))); }), key)); } samples.sort((x, y) => x - y); report.timings[name] = { medianMs: +samples[Math.floor(samples.length / 2)].toFixed(1), maxMs: +samples.at(-1).toFixed(1), samples: samples.length }; };
    const firstKeys = bigSnap.corrections.slice(0, 30).map(c => c.id);
    await timed('selectInList300', { keys: firstKeys });
    await clickRow(b.page, firstKeys[40] ?? bigSnap.corrections[40].id); await sleep(300);
    const target = bigSnap.corrections.at(-1);
    await b.page.evaluate(k => { const words = [...document.querySelectorAll('[data-sync-transcript] .correction-highlight')]; words.at(-1).click(); }, target.id);
    await b.page.waitForSelector(rowSel(target.id), { timeout: 20000 }); await sleep(600);
    v = await views(b.page);
    check('300: selecting the last correction from the transcript extends the list and shows it', v.row === target.id, v);
    check('300: the list scrolled to it', await inPanel(b.page, 'ul.rows', rowSel(target.id)), null);
    await b.page.evaluate(() => { document.querySelector('[data-sync-image]').scrollTop = 0; document.querySelector('[data-sync-transcript]').scrollTop = 0; });
    await clickRow(b.page, target.id); await sleep(100);
    const scrolled = await b.page.evaluate(() => { const p = document.querySelector('[data-sync-transcript]'), w = p.querySelector('.is-sync-active'); const a = p.getBoundingClientRect(), r = w?.getBoundingClientRect(); return { top: p.scrollTop, inView: r ? r.top >= a.top && r.bottom <= a.bottom : null, window: window.scrollY }; });
    check('reduced motion: the transcript is there at once, with no animation', scrolled.inView === true, scrolled);
    await shot(b.page, '08-300-corrections');
    await b.context.close();
  } finally {
    const reasons = Object.entries(report.consoleErrors).filter(([, v]) => v.length);
    console.log('TIMINGS', JSON.stringify(report.timings));
    console.log('CONSOLE ERRORS', JSON.stringify(Object.fromEntries(reasons)));
    console.log('FAILED CALLS', JSON.stringify(Object.fromEntries(Object.entries(report.failedCalls).filter(([, v]) => v.length))));
    console.log(`${report.steps.filter(s => s.ok).length}/${report.steps.length} passed`);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
    await h.close();
  }
  if (report.failures.length) process.exitCode = 1;
};
