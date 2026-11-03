'use strict';
// Real-browser QA of the review workspace's highlight sync (Task 6C), against the real backend code in-process with an in-memory database.
// Synthetic text only. Needs the backend next to this repo.
//   node scripts/qa-highlight-sync.cjs baseline <distDir> <out.json>    student pages and the 6D preview as text and counts, from any build
//   node scripts/qa-highlight-sync.cjs compare <before.json> <after.json>
//   node scripts/qa-highlight-sync.cjs run [outputDir]                  the sync checks (needs npm run build:prod)
// The fixture boxes are in percent of the image, which is what the OCR pipeline stores and the overlay draws (the shared annotation fixture uses 0..1).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const BACKEND = path.resolve(__dirname, '../../backend');
const [mode, arg1, arg2] = process.argv.slice(2);

if (mode === 'compare') {
  const before = JSON.parse(fs.readFileSync(arg1, 'utf8')), after = JSON.parse(fs.readFileSync(arg2, 'utf8'));
  const flat = (o, prefix = '') => Object.entries(o).flatMap(([k, v]) => v && typeof v === 'object' ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]);
  const a = new Map(flat(before)), b = new Map(flat(after));
  let differ = 0;
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const same = a.get(key) === b.get(key);
    if (!same) { differ++; console.log(`DIFFERENT ${key}\n  before: ${String(a.get(key)).slice(0, 400)}\n  after:  ${String(b.get(key)).slice(0, 400)}`); }
  }
  console.log(`${a.size} values compared, ${differ} different`);
  process.exit(differ ? 1 : 0);
}

const FRONT_PORT = mode === 'baseline' ? 4411 : 4412;
Object.assign(process.env, { JWT_SECRET: 'highlight-sync-qa', NODE_ENV: 'test', GUEST_SUBMISSION_ENABLED: 'true', FRONTEND_URL: `http://localhost:${FRONT_PORT}`,
  UPLOAD_BASE_PATH: `uploads/highlight-sync-qa-${process.pid}`, SENSITIVE_RATE_LIMIT_MAX: '100000', AUTH_READ_RATE_LIMIT_MAX: '100000', AUTH_WRITE_RATE_LIMIT_MAX: '100000',
  ANNOTATION_RATE_LIMIT_MAX: '100000', SSE_TOKEN_RATE_LIMIT_MAX: '100000' });
const need = name => require(path.join(BACKEND, name));
const express = need('node_modules/express'), puppeteer = need('node_modules/puppeteer'), sharp = need('node_modules/sharp');
const quiet = need('src/utils/logger');
for (const level of ['debug', 'info', 'warn', 'metric']) if (typeof quiet[level] === 'function') quiet[level] = () => {};
const app = need('src/app');
const { connectInMemoryMongo, disconnectInMemoryMongo } = need('tests/helpers/testServer');
const { seedTestPlans } = need('tests/helpers/seedTestPlans');
const { signTestJwt } = need('tests/helpers/auth');
const { seedAnnotationFixture, rerunOcr } = need('tests/helpers/annotationFixture');
const { annotationApi, manualValue } = need('tests/helpers/annotationApi');
const access = need('src/services/guestAccess.service');
const pipeline = need('src/services/canonicalCorrectionsPipeline.service');
const evidence = need('src/services/correctionEvidenceIdentity.service');
const { buildCanonicalSubmissionTranscript } = need('src/utils/ocrTranscriptNormalizer');
const { resolveLegend } = need('src/services/correctionLegendResolver.service');
const Submission = need('src/models/Submission'), SubmissionFeedback = need('src/models/SubmissionFeedback'), File = need('src/models/File'),
  User = need('src/models/user.model'), Assignment = need('src/models/assignment.model'), Membership = need('src/models/membership.model');
const mongoose = need('node_modules/mongoose');

const uploadRoot = path.resolve(BACKEND, process.env.UPLOAD_BASE_PATH);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const oid = () => new mongoose.Types.ObjectId();
const uuidName = (ext = 'png') => `${crypto.randomUUID()}.${ext}`;

/** Re-binds the stored evidence after the page data changed (the hash covers the boxes), as a completed pipeline would have. */
async function rebind(doc) {
  const assignment = await Assignment.findById(doc.assignment);
  const transcript = buildCanonicalSubmissionTranscript(doc);
  const sourceHash = pipeline.buildCorrectionSourceHash({ transcript: transcript.text, pages: transcript.pages, assignment, fileContentIdentity: doc.fileContentIdentity, legend: await resolveLegend() });
  doc.transcriptText = transcript.text;
  doc.correctionSourceHash = sourceHash;
  doc.writingCorrections = evidence.bindCorrections(doc.writingCorrections.map(c => (c.toObject ? c.toObject() : c)), transcript, doc);
  doc.correctionOcrEvidenceHash = evidence.ocrEvidenceHash(transcript, doc);
  await doc.save();
  await SubmissionFeedback.updateOne({ submissionId: doc._id }, { $set: { evaluationSourceHash: sourceHash, detailedFeedbackSourceHash: sourceHash } });
  return transcript;
}
const percentWords = (fileId, page, words, perLine = 12) => words.map((text, i) => {
  const line = Math.floor(i / perLine), col = i % perLine;
  return { id: `word_${fileId}_${page}_${i + 1}`, text, page, bbox: { x0: 3 + col * 8, y0: 4 + line * 3.5, x1: 3 + col * 8 + 6.5, y1: 4 + line * 3.5 + 2.6 } };
});
async function toPercent(submissionId) {
  const doc = await Submission.findById(submissionId);
  const fileId = String(doc.files[0]);
  doc.ocrPages[0].words = percentWords(fileId, 1, doc.ocrPages[0].words.map(w => w.text));
  doc.markModified('ocrPages');
  await rebind(doc);
}
/** A stored image under the file name format the server serves. */
async function storeImage(fileId, buffer, ext, owner) {
  const name = uuidName(ext);
  fs.mkdirSync(path.join(uploadRoot, 'submissions'), { recursive: true });
  fs.writeFileSync(path.join(uploadRoot, 'submissions', name), buffer);
  await File.create({ _id: fileId, originalName: `essay.${ext}`, filename: name, path: `${process.env.UPLOAD_BASE_PATH}/submissions/${name}`, url: `/uploads/submissions/${name}`, uploadedBy: owner, role: 'student', type: 'submissions',
    mimeType: ext === 'png' ? 'image/png' : 'image/jpeg', size: buffer.length });
  return `/uploads/submissions/${name}`;
}
const pageImage = (width, height, words, background, orientation) => {
  const overlay = Buffer.from(`<svg width="${width}" height="${height}">${words.map(w => `<text x="${w.bbox.x0 / 100 * width}" y="${w.bbox.y1 / 100 * height}" font-size="${Math.round(height * 0.02)}" fill="#223">${w.text}</text>`).join('')}</svg>`);
  const image = sharp({ create: { width, height, channels: 3, background } }).composite([{ input: overlay }]);
  return orientation ? image.withMetadata({ orientation }).jpeg().toBuffer() : image.png().toBuffer();
};

/** Another student's submission, copied from the registered one so it carries a current evaluation. */
async function cloneSubmission(fixture, name) {
  const studentId = oid();
  await User.create({ _id: studentId, firebaseUid: `fixture-${name}`, email: `${name}@example.com`, role: 'student', displayName: name });
  await Membership.create({ student: studentId, class: fixture.IDS.class, status: 'active' });
  const source = await Submission.collection.findOne({ _id: fixture.IDS.registered }), feedback = await SubmissionFeedback.collection.findOne({ submissionId: fixture.IDS.registered });
  const id = oid();
  const copy = { ...source, _id: id, student: studentId, fileContentIdentity: `fixture-${name}` };
  delete copy.teacherAnnotations;
  await Submission.collection.insertOne(copy);
  await SubmissionFeedback.collection.insertOne({ ...feedback, _id: oid(), submissionId: id, studentId });
  return { id, studentId };
}

async function seedAll() {
  const fixture = await seedAnnotationFixture({ uploadRoot });
  await User.updateOne({ _id: fixture.teacher._id }, { $set: { displayName: 'Ms Rahman' } });
  // Files under the name format the server serves, with text on the image at the boxes.
  for (const [fileId, submissionId] of [[fixture.IDS.fileRegistered, fixture.IDS.registered], [fixture.IDS.fileGuest, fixture.IDS.guest]]) {
    await toPercent(submissionId);
    const doc = await Submission.findById(submissionId);
    const name = uuidName('png');
    fs.rmSync(path.join(uploadRoot, 'submissions', `${fileId}.png`));
    fs.writeFileSync(path.join(uploadRoot, 'submissions', name), await pageImage(1200, 900, doc.ocrPages[0].words, { r: 252, g: 250, b: 245 }));
    await File.updateOne({ _id: fileId }, { $set: { filename: name, path: `${process.env.UPLOAD_BASE_PATH}/submissions/${name}`, url: `/uploads/submissions/${name}` } });
    await Submission.updateOne({ _id: submissionId }, { $set: { fileUrl: `/uploads/submissions/${name}`, fileUrls: [`/uploads/submissions/${name}`] } });
  }
  const rubricScores = { CONTENT: { score: 15, maxScore: 20, comment: 'Ideas are relevant.', issueCount: 0 }, ORGANIZATION: { score: 15, maxScore: 20, comment: 'Clear order.', issueCount: 0 },
    GRAMMAR: { score: 18, maxScore: 25, comment: 'Watch verb agreement.', issueCount: 3 }, VOCABULARY: { score: 15, maxScore: 20, comment: 'Word choice is adequate.', issueCount: 0 },
    MECHANICS: { score: 8, maxScore: 10, comment: 'Check spelling.', issueCount: 2 }, PRESENTATION: { score: 4.5, maxScore: 5, comment: 'Readable.', issueCount: 0 } };
  await SubmissionFeedback.collection.updateMany({}, { $set: { rubricScores, overallScore: 75.5, grade: 'C' } });

  // The main submission: every state the teacher can have, saved through the real API.
  const api = annotationApi(app, fixture.teacher), id = fixture.IDS.registered;
  const doc = await Submission.findById(id);
  const list = (await api.snapshot(id)).body.data.corrections;
  const byQuote = (q, n = 0) => list.filter(c => c.quotedText === q)[n];
  const expectOk = (r, what) => { if (r.status !== 200) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`); };
  expectOk(await api.act(id, { action: 'hide', id: byQuote('dont').id }), 'hide');
  expectOk(await api.act(id, { action: 'archive', id: byQuote('realy').id }), 'archive');
  expectOk(await api.act(id, { action: 'add', value: manualValue(doc, 'park', { symbol: 'ART', category: 'GRAMMAR' }) }), 'add');
  // A hidden correction whose stored words no longer say what it quotes: the safety check must refuse to draw it.
  const mismatch = byQuote('a');
  expectOk(await api.act(id, { action: 'hide', id: mismatch.id }), 'hide mismatch');
  await Submission.collection.updateOne({ _id: id, 'writingCorrections.id': mismatch.id }, { $set: { 'writingCorrections.$.wordIds': [`word_${fixture.IDS.fileRegistered}_1_1`] } });

  // 300 corrections on 1500 words.
  const big = await cloneSubmission(fixture, 'bigessay');
  const vocabulary = ['the', 'children', 'went', 'to', 'school', 'and', 'played', 'with', 'their', 'friends', 'every', 'day', 'because', 'it', 'was', 'fun'];
  const words = Array.from({ length: 1500 }, (_, i) => vocabulary[i % vocabulary.length]);
  const specs = Array.from({ length: 300 }, (_, k) => [k * 5 + 1, k % 3 === 0 ? 'SP' : 'AGR', k % 3 === 0 ? 'MECHANICS' : 'GRAMMAR', 'x', `Check word ${k}.`]);
  await rerunOcr({ submissionId: big.id, words, specs, ocrJobId: 'job-big' });
  {
    const d = await Submission.findById(big.id);
    d.ocrPages[0].words = percentWords(String(d.files[0]), 1, words, 25).map(w => ({ ...w, bbox: { x0: 1 + (w.bbox.x0 - 3) / 8 * 3.9, x1: 1 + (w.bbox.x0 - 3) / 8 * 3.9 + 3.4, y0: 1 + (w.bbox.y0 - 4) / 3.5 * 1.6, y1: 1 + (w.bbox.y0 - 4) / 3.5 * 1.6 + 1.2 } }));
    d.markModified('ocrPages');
    await rebind(d);
  }

  // Two files: one upright, one a JPEG with EXIF orientation 6 whose boxes are in encoded-image axes. Includes a three-word span over a line break.
  const multi = await cloneSubmission(fixture, 'multipage');
  {
    const f1 = oid(), f2 = oid();
    const w1 = 'She walk to school every morning with her small brother and they was always late for the first lesson of the day'.split(' ');
    const w2 = 'After class the teacher ask them to read more book at home because reading help everyone learn new word'.split(' ');
    const p1 = percentWords(f1, 1, w1), p2 = percentWords(f2, 1, w2);
    const u1 = await storeImage(f1, await pageImage(1200, 900, p1, { r: 250, g: 250, b: 240 }), 'png', multi.studentId);
    const u2 = await storeImage(f2, await pageImage(1200, 900, p2, { r: 240, g: 248, b: 252 }, 6), 'jpg', multi.studentId);
    const d = await Submission.findById(multi.id);
    d.files = [f1, f2]; d.file = f1; d.fileOrder = [{ fileId: f1, order: 0 }, { fileId: f2, order: 1 }]; d.fileUrls = [u1, u2]; d.fileUrl = u1;
    d.ocrPages = [
      { _id: oid(), fileId: String(f1), fileOrder: 0, pageNumber: 1, pageIndex: 0, text: w1.join(' '), rawText: w1.join(' '), words: p1, coordinateSpace: 'display-image', width: 1200, height: 900, ocrImageWidth: 1200, ocrImageHeight: 900 },
      { _id: oid(), fileId: String(f2), fileOrder: 1, pageNumber: 1, pageIndex: 1, text: w2.join(' '), rawText: w2.join(' '), words: p2, coordinateSpace: 'encoded-image', width: 1200, height: 900, ocrImageWidth: 1200, ocrImageHeight: 900, ocrExifOrientation: 6 }];
    const transcript = buildCanonicalSubmissionTranscript(d);
    const spec = (pageIndex, first, last, symbol, category, message) => {
      const page = transcript.pages[pageIndex], words = pageIndex ? w2 : w1;
      let at = page.startChar; for (let i = 0; i < first; i++) at += words[i].length + 1;
      const quoted = words.slice(first, last + 1).join(' ');
      const fileId = pageIndex ? f2 : f1, wordIds = Array.from({ length: last - first + 1 }, (_, k) => `word_${fileId}_1_${first + k + 1}`);
      return { id: `ai_${crypto.createHash('sha1').update(`${pageIndex}:${first}:${last}`).digest('hex').slice(0, 16)}`, source: 'AI', fileId: String(fileId), page: 1, startChar: at, endChar: at + quoted.length,
        quotedText: quoted, suggestedText: 'x', message, category, symbol, groupKey: category, symbolLabel: symbol, color: '#c0392b', wordIds, evidenceWordIds: [...wordIds] };
    };
    d.writingCorrections = [spec(0, 1, 1, 'AGR', 'GRAMMAR', 'Use walks.'), spec(0, 10, 13, 'AGR', 'GRAMMAR', 'A span over a line break.'), spec(1, 4, 4, 'AGR', 'GRAMMAR', 'Use asked.'), spec(1, 8, 9, 'SP', 'MECHANICS', 'Use books.')];
    d.correctionStatistics = { grammar: 3, mechanics: 1, content: 0, organization: 0, vocabulary: 0, total: 4 };
    d.markModified('ocrPages'); d.markModified('writingCorrections');
    await rebind(d);
  }
  // A PDF of two pages, as the server stores one: derived page images under /files, with their source file recorded.
  const pdf = await cloneSubmission(fixture, 'pdfstudent');
  {
    const source = oid(), w1 = 'My first page has one mistake in it right here'.split(' '), w2 = 'The second page also contain a mistake near the end'.split(' ');
    const p1 = percentWords(source, 1, w1), p2 = percentWords(source, 2, w2);
    const pdfName = `${crypto.randomUUID()}.pdf`;
    fs.writeFileSync(path.join(uploadRoot, 'submissions', pdfName), Buffer.from('%PDF-1.4\n%fixture\n'));
    await File.create({ _id: source, originalName: 'essay.pdf', filename: pdfName, path: `${process.env.UPLOAD_BASE_PATH}/submissions/${pdfName}`, url: `/uploads/submissions/${pdfName}`, uploadedBy: pdf.studentId, role: 'student', type: 'submissions' });
    const pageFile = async (pageNumber, words, background) => {
      const _id = oid(), filename = `${crypto.randomUUID()}.jpg`, buffer = await sharp(await pageImage(1000, 1400, words, background)).jpeg().toBuffer();
      fs.writeFileSync(path.join(uploadRoot, 'submissions', filename), buffer);
      await File.create({ _id, originalName: `PDF page ${pageNumber}.jpg`, filename, path: path.join(uploadRoot, 'submissions', filename), url: `/files/submissions/${filename}`, uploadedBy: pdf.studentId, role: 'student', type: 'submissions',
        sourceFileId: source, sourcePageCount: 2, pageNumber, width: 1000, height: 1400, rasterizationVersion: 'v1' });
      return { derivedImageFileId: String(_id), pageImageUrl: `/files/submissions/${filename}`, rasterizationVersion: 'v1' };
    };
    const i1 = await pageFile(1, p1, { r: 250, g: 250, b: 240 }), i2 = await pageFile(2, p2, { r: 240, g: 248, b: 252 });
    const d = await Submission.findById(pdf.id);
    d.files = [source]; d.file = source; d.fileOrder = [{ fileId: source, order: 0 }]; d.fileUrls = [`/uploads/submissions/${pdfName}`]; d.fileUrl = `/uploads/submissions/${pdfName}`;
    const common = { fileId: String(source), fileOrder: 0, coordinateSpace: 'display-image', width: 1000, height: 1400, ocrImageWidth: 1000, ocrImageHeight: 1400 };
    d.ocrPages = [{ _id: oid(), ...common, ...i1, pageNumber: 1, pageIndex: 0, text: w1.join(' '), rawText: w1.join(' '), words: p1 }, { _id: oid(), ...common, ...i2, pageNumber: 2, pageIndex: 1, text: w2.join(' '), rawText: w2.join(' '), words: p2 }];
    const transcript = buildCanonicalSubmissionTranscript(d);
    const at = (pageIndex, word, words) => { let c = transcript.pages[pageIndex].startChar; for (let i = 0; i < word; i++) c += words[i].length + 1; return c; };
    const mk = (pageIndex, word, words, symbol) => ({ id: `ai_pdf${pageIndex}${word}`, source: 'AI', fileId: String(source), page: pageIndex + 1, startChar: at(pageIndex, word, words), endChar: at(pageIndex, word, words) + words[word].length, quotedText: words[word], suggestedText: 'x', message: 'Check.', category: 'GRAMMAR', symbol, groupKey: 'GRAMMAR', symbolLabel: symbol, color: '#c0392b', wordIds: [`word_${source}_${pageIndex + 1}_${word + 1}`], evidenceWordIds: [`word_${source}_${pageIndex + 1}_${word + 1}`] });
    d.writingCorrections = [mk(0, 5, w1, 'AGR'), mk(1, 3, w2, 'AGR')];
    d.correctionStatistics = { grammar: 2, mechanics: 0, content: 0, organization: 0, vocabulary: 0, total: 2 };
    d.markModified('ocrPages'); d.markModified('writingCorrections');
    await rebind(d);
  }
  // A hidden correction the text no longer holds (an OCR re-run): it becomes an orphan.
  const orphan = await cloneSubmission(fixture, 'orphanstudent');
  {
    const first = (await api.snapshot(orphan.id)).body.data.corrections.find(c => c.quotedText === 'dont');
    expectOk(await api.act(orphan.id, { action: 'hide', id: first.id }), 'hide before the re-run');
    await rerunOcr({ submissionId: orphan.id, words: 'Nothing in this new text matches what the student wrote before at all'.split(' '), specs: [[2, 'SP', 'MECHANICS', 'x', 'Check.']], ocrJobId: 'job-orphan' });
    await toPercent(orphan.id);
  }
  // A visible correction on a word the OCR has no box for.
  const noBox = await cloneSubmission(fixture, 'noboxstudent');
  {
    const d = await Submission.findById(noBox.id);
    d.ocrPages[0].words = d.ocrPages[0].words.map(w => (w.text === 'realy' ? { ...(w.toObject ? w.toObject() : w), bbox: null } : (w.toObject ? w.toObject() : w)));
    d.markModified('ocrPages');
    await rebind(d);
  }
  return { fixture, api, big, multi, pdf, orphan, noBox };
}

/** A site for a built frontend, a browser, and a page helper that lists console errors and failed calls per page. */
async function harness(build, report) {
  const frontend = express();
  frontend.use(express.static(build));
  frontend.get(/.*/, (_req, res) => res.sendFile(path.join(build, 'index.html')));
  const listen = (server, port) => new Promise((resolve, reject) => { const l = server.listen(port, () => resolve(l)); l.on('error', reject); });
  const apiServer = await listen(app, 0), site = await listen(frontend, FRONT_PORT);
  const apiPort = apiServer.address().port;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  async function open(label, jwt, url, ready, { width = 1500, height = 1100, touch = false, reducedMotion = false } = {}) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width, height, hasTouch: touch });
    if (reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    if (jwt) await page.evaluateOnNewDocument(token => { localStorage.setItem('backend_jwt', token); }, jwt);
    report.consoleErrors[label] = []; report.failedCalls[label] = [];
    // Real downloads: a cross-origin request is also preceded by an OPTIONS preflight, which carries no image.
    const seen = { imageRequests: [] };
    page.on('console', msg => { if (msg.type() === 'error') report.consoleErrors[label].push(msg.text().replace(/[a-f0-9]{24}/g, '<id>').slice(0, 200)); });
    page.on('pageerror', error => report.consoleErrors[label].push(`pageerror: ${String(error.message).slice(0, 200)}`));
    await page.setRequestInterception(true);
    page.on('request', req => {
      const target = new URL(req.url());
      if (target.pathname.startsWith('/api/') || target.pathname.startsWith('/uploads/') || target.pathname.startsWith('/files/')) return req.continue({ url: `http://127.0.0.1:${apiPort}${target.pathname}${target.search}` });
      if (['127.0.0.1', 'localhost'].includes(target.hostname) || ['data:', 'blob:'].includes(target.protocol)) return req.continue();
      if (req.resourceType() === 'stylesheet') return req.respond({ status: 200, contentType: 'text/css', body: '' });
      return req.abort();
    });
    page.on('response', res => {
      const target = new URL(res.url());
      if (res.request().method() === 'GET' && !target.protocol.startsWith('blob') && /^\/(uploads|files)\//.test(target.pathname) && /^image\//.test(res.headers()['content-type'] || '')) seen.imageRequests.push(target.pathname);
      if (/^\/(api|uploads|files)\//.test(target.pathname) && res.status() >= 400) report.failedCalls[label].push(`${res.request().method()} ${target.pathname.replace(/[a-f0-9]{24}/g, ':id')} ${res.status()}`);
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector(ready, { timeout: 60000 });
    return { page, context, seen };
  }
  return { open, close: async () => { await browser.close(); apiServer.close(); site.close(); }, base: `http://localhost:${FRONT_PORT}` };
}
const teacherUrl = (base, fixture, studentId, submissionId) => `${base}/teacher/my-classes/detail/student-submissions/${studentId}?classId=${fixture.IDS.class}&assignmentId=${fixture.IDS.assignment}&submissionId=${submissionId}`;

/** A student page (or the preview dialog) as text and counts, in both of its views. Times are the only thing masked. */
async function readSurface(page, scope) {
  await page.waitForFunction(sel => /Grammar/.test(document.querySelector(sel)?.textContent || ''), { timeout: 60000 }, scope);
  await sleep(2500);
  const pick = () => page.evaluate(sel => {
    const live = document.querySelector(sel), root = live.cloneNode(true);
    const count = q => live.querySelectorAll(q).length;
    return { text: root.textContent.replace(/\s+/g, ' ').replace(/\d{1,2}:\d{2}(:\d{2})?\s?(AM|PM)?/g, '<time>').trim(),
      counts: { markers: count('.correction-overlay__marker'), underlines: count('.correction-overlay__underline'), rails: count('.correction-overlay__semantic-rail'), highlights: count('.correction-highlight'),
        buttons: count('button'), tabStops: count('[tabindex="0"]'), images: count('img'), syncAttributes: count('[data-sync-state], [data-word-id], .is-sync-active') } };
  }, scope);
  const uploaded = await pick();
  await page.evaluate(sel => [...document.querySelector(sel).querySelectorAll('button')].find(b => /Transcribed Text/.test(b.textContent))?.click(), scope);
  await page.waitForSelector(`${scope} app-tokenized-transcript .correction-highlight`, { timeout: 60000 });
  await sleep(1000);
  return { uploaded, transcript: await pick() };
}

async function baseline(build, outFile) {
  const report = { consoleErrors: {}, failedCalls: {} };
  await connectInMemoryMongo(); await seedTestPlans();
  const { fixture, multi } = await seedAll();
  const h = await harness(build, report);
  const teacherJwt = signTestJwt({ id: fixture.teacher._id, role: 'teacher', firebaseUid: fixture.teacher.firebaseUid });
  const studentJwt = signTestJwt({ id: fixture.student._id, role: 'student', firebaseUid: fixture.student.firebaseUid });
  const multiJwt = signTestJwt({ id: multi.studentId, role: 'student', firebaseUid: 'fixture-multipage' });
  const studentUrl = `${h.base}/student/my-classes/detail/my-submissions/${fixture.IDS.assignment}?classId=${fixture.IDS.class}`;
  const out = {};
  let s = await h.open('student', studentJwt, studentUrl, 'app-my-submission-page');
  out.student = await readSurface(s.page, 'app-my-submission-page'); await s.context.close();
  s = await h.open('student-two-files', multiJwt, studentUrl, 'app-my-submission-page');
  out.studentTwoFiles = await readSurface(s.page, 'app-my-submission-page'); await s.context.close();
  const link = new URL(access.returnUrl(String(fixture.IDS.guest), fixture.guestToken));
  s = await h.open('guest', null, `${h.base}${link.pathname}${link.hash}`, 'app-my-submission-page');
  out.guest = await readSurface(s.page, 'app-my-submission-page'); await s.context.close();
  s = await h.open('preview', teacherJwt, teacherUrl(h.base, fixture, fixture.student._id, fixture.IDS.registered), 'app-student-submission-pages');
  await s.page.waitForSelector('[data-preview-open]', { timeout: 60000 }); await sleep(2000);
  console.log('TEACHER PAGE IMAGE DOWNLOADS', s.seen.imageRequests.length);
  await s.page.click('[data-preview-open]');
  await s.page.waitForSelector('dialog[open] app-my-submission-page', { timeout: 30000 });
  out.preview = await readSurface(s.page, 'dialog[open] app-my-submission-page'); await s.context.close();
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { uploadedChars: v.uploaded.text.length, transcriptChars: v.transcript.text.length, uploaded: v.uploaded.counts, transcript: v.transcript.counts }])), null, 0));
  console.log('console errors', JSON.stringify(report.consoleErrors)); console.log('failed calls', JSON.stringify(report.failedCalls));
  await h.close();
}

(async () => {
  try {
    if (mode === 'baseline') await baseline(path.resolve(arg1), path.resolve(arg2));
    else if (mode === 'run') await require('./qa-highlight-sync-run.cjs')({ out: path.resolve(arg1 || path.join(__dirname, '../../output/highlight-sync-qa')), seedAll, harness, teacherUrl, sleep, signTestJwt, connectInMemoryMongo, seedTestPlans, Submission, annotationApi, app, uploadRoot });
    else { console.error('usage: baseline <distDir> <out.json> | compare <a> <b> | run [outDir]'); process.exitCode = 2; }
  } catch (error) { console.error('QA FAILED', error.stack); process.exitCode = 1; }
  await disconnectInMemoryMongo().catch(() => {});
  fs.rmSync(uploadRoot, { recursive: true, force: true });
  process.exit(process.exitCode || 0);
})();
