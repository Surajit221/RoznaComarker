/* Development-only browser harness: bundles the REAL shared Angular component with synthetic data.
 * No application API, OCR, AI, credentials or persisted correction mutations. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const puppeteer = require('puppeteer');
const root = path.resolve(__dirname, '..');
const out = path.resolve(root, '../output/annotation-ui-v2');
const realInput = process.env.ANNOTATION_QA_REAL_INPUT;
fs.mkdirSync(out, { recursive: true });

const entry = `import 'zone.js';
import '@angular/compiler';
import { bootstrapApplication } from '@angular/platform-browser';
import { CorrectionOverlay } from './src/app/components/correction-overlay/correction-overlay';
bootstrapApplication(CorrectionOverlay).then(app => {
  const ref = app.components[0];
  window.qa = { render(data) {
    ref.instance.closeFromControl();
    for (const [key, value] of Object.entries(data)) ref.setInput(key, value);
    app.tick();
  }, component: ref.instance };
});`;

function fixture(kind, page = 1) {
  const narrow = kind === 'narrow';
  const words = [], text = [];
  const vocabulary = ['Students', 'often', 'use', 'social', 'media', 'to', 'share', 'ideas.'];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const x = (narrow ? 1 : 9) + col * (narrow ? 12 : 10.3), y = 12 + row * 9;
      const w = narrow ? 11 : 9;
      const id = `word${row * 8 + col}`;
      words.push({ id, text: vocabulary[col], bbox: { x, y, w, h: 2.6 }, separatorBefore: col ? ' ' : '\n' });
      text.push(`<text x="${x * 10}" y="${(y + 2.3) * 12}" textLength="${w * 10 - 6}" lengthAdjust="spacingAndGlyphs">${vocabulary[col]}</text>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1200"><rect width="1000" height="1200" fill="#fffdf7"/><g stroke="#dce8ee">${Array.from({ length: 20 }, (_, i) => `<path d="M0 ${140 + i * 48}H1000"/>`).join('')}</g><g font-family="Segoe Print, cursive" font-size="26" fill="#303949">${text.join('')}</g></svg>`;
  const annotations = [];
  const add = (id, symbol, category, wordIds) => annotations.push({ _id: id, submissionId: 'visual-fixture',
    page, wordIds, symbol, category, group: category, source: 'AI', editable: false,
    color: { GRAMMAR: '#B7E4C7', MECHANICS: '#FFF3BF', CONTENT: '#FFD6A5', ORGANIZATION: '#CDE7F0' }[category],
    quotedText: 'Students often use social media', message: `Canonical fixture explanation ${id}.`,
    suggestedText: `Canonical fixture suggestion ${id}.` });
  const dense = kind !== 'clean';
  for (let i = 0; i < (dense ? 28 : 4); i++) add(`local-${i}`, i % 2 ? 'AGR' : 'SP',
    i % 2 ? 'GRAMMAR' : 'MECHANICS', [`word${i}`]);
  if (dense) {
    add('same-word', 'WC', 'GRAMMAR', ['word1']);
    add('same-phrase', 'P', 'MECHANICS', ['word1', 'word2']);
    for (let i = 0; i < 9; i++) {
      const start = Math.floor(i / 3) * 8;
      add(`semantic-${i}`, i % 3 === 2 ? 'COH' : 'DEV', i % 3 === 2 ? 'ORGANIZATION' : 'CONTENT',
        words.slice(start, start + 12).map((w) => w.id));
    }
  } else add('semantic-clean', 'DEV', 'CONTENT', ['word16', 'word17', 'word24']);
  // Wrong-page data deliberately present to assert page isolation in the live component.
  annotations.push({ ...annotations[0], _id: 'wrong-page', page: page + 1 });
  return { imageUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, ocrWords: words, annotations, page };
}

(async () => {
  await esbuild.build({ stdin: { contents: entry, resolveDir: root, sourcefile: 'annotation-qa-entry.ts', loader: 'ts' },
    outfile: path.join(out, 'harness.js'), bundle: true, format: 'iife', platform: 'browser',
    tsconfig: path.join(root, 'tsconfig.json'), plugins: [{ name: 'inline-angular-resources', setup(build) {
      build.onLoad({ filter: /correction-overlay\.ts$/ }, ({ path: filename }) => {
        let contents = fs.readFileSync(filename, 'utf8');
        contents = contents.replace("templateUrl: './correction-overlay.html'", `template: ${JSON.stringify(fs.readFileSync(path.join(path.dirname(filename), 'correction-overlay.html'), 'utf8'))}`)
          .replace("styleUrl: './correction-overlay.css'", `styles: [${JSON.stringify(fs.readFileSync(path.join(path.dirname(filename), 'correction-overlay.css'), 'utf8'))}]`);
        return { contents, loader: 'ts' };
      });
    } }] });
  const html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;background:#edf1f5;font:14px system-ui}main{max-width:1000px;margin:auto}h1{font-size:18px}app-correction-overlay{display:block;width:100%}</style><main><h1 id="title">Annotation visual QA</h1><app-correction-overlay></app-correction-overlay></main><script src="/harness.js"></script>';
  fs.writeFileSync(path.join(out, 'index.html'), html);
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/harness.js' ? 'text/javascript' : 'text/html');
    res.end(req.url === '/harness.js' ? fs.readFileSync(path.join(out, 'harness.js')) : html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-gpu'], pipe: true });
  const results = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (error) => console.error(error.message));
    for (const width of [1440, 1024, 768, 430, 390, 375]) {
      await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.waitForFunction(() => window.qa);
      for (const kind of ['clean', 'dense', 'narrow', 'page2', ...(realInput ? ['real'] : [])]) {
        const data = kind === 'real' ? JSON.parse(fs.readFileSync(realInput, 'utf8')) : fixture(kind, kind === 'page2' ? 2 : 1);
        await page.evaluate((data) => window.qa.render(data), data);
        await page.waitForFunction(() => window.qa.component.mediaState === 'loaded');
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const metrics = await page.evaluate(() => {
          const stage = document.querySelector('.correction-overlay__image-stage').getBoundingClientRect();
          const badges = [...document.querySelectorAll('.correction-overlay__marker')].map((b) => b.getBoundingClientRect());
          let overlaps = 0;
          for (let i = 0; i < badges.length; i++) for (let j = i + 1; j < badges.length; j++) {
            const a = badges[i], b = badges[j];
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlaps++;
          }
          return { imageWidth: stage.width, badges: badges.length, overlaps, outside: badges.filter((b) => b.left < stage.left - 1 || b.right > stage.right + 1 || b.top < stage.top - 1 || b.bottom > stage.bottom + 1).length,
            corrections: window.qa.component.markers.flatMap((g) => g.annotations).length,
            pageLeak: window.qa.component.markers.some((g) => g.annotations.some((a) => a._id === 'wrong-page')) };
        });
        await page.screenshot({ path: path.join(out, `${kind}-${width}.png`), fullPage: true });
        results.push({ width, kind, ...metrics });
        if (metrics.outside || metrics.pageLeak || metrics.overlaps) throw new Error(`Bounds/collision/page QA failed ${width}/${kind}`);
        if (kind === 'dense') {
          await page.click('.correction-overlay__marker');
          await page.waitForSelector('.correction-overlay__tooltip.is-open');
          const selectedWidth = await page.$eval('.correction-overlay__image-stage', (stage) => stage.getBoundingClientRect().width);
          if (Math.abs(selectedWidth - metrics.imageWidth) > 1) throw new Error('Dialog changed image width');
          await page.screenshot({ path: path.join(out, `selected-${width}.png`), fullPage: false });
          await page.click('.correction-overlay__close');
        }
        if (kind === 'real') {
          const verified = await page.evaluate(() => {
            const component = window.qa.component;
            const ids = new Set();
            for (const button of document.querySelectorAll('.correction-overlay__marker')) {
              button.click();
              const group = component.activeMarker;
              if (!group) throw new Error('Real marker did not open');
              for (const annotation of group.annotations) {
                component.selectCorrection(annotation);
                if (component.explanation !== (annotation.message || '').trim()
                  || component.suggestion !== (annotation.suggestedText || '').trim()) throw new Error('Canonical detail mismatch');
                ids.add(annotation._id);
              }
              component.closeFromControl();
            }
            return ids.size;
          });
          if (verified !== metrics.corrections) throw new Error('Real correction membership mismatch');
          await page.click('.correction-overlay__marker');
          await page.waitForSelector('.correction-overlay__tooltip.is-open');
          const selectedWidth = await page.$eval('.correction-overlay__image-stage', (stage) => stage.getBoundingClientRect().width);
          if (Math.abs(selectedWidth - metrics.imageWidth) > 1) throw new Error('Real dialog changed image width');
          await page.screenshot({ path: path.join(out, `real-selected-${width}.png`), fullPage: false });
          await page.click('.correction-overlay__close');
        }
      }
    }
    fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  } finally { await browser.close(); server.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
