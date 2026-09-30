const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const puppeteer = require('puppeteer');

const root = path.resolve(__dirname, '..');
const out = path.resolve(root, '..', 'output', 'annotation-visual-qa');
fs.mkdirSync(out, { recursive: true });
const bundled = path.join(out, 'annotation-geometry.cjs');
esbuild.buildSync({ entryPoints: [path.join(root, 'src/app/components/correction-overlay/annotation-geometry.ts')],
  outfile: bundled, bundle: true, platform: 'node', format: 'cjs' });
const { buildAnnotationVisuals } = require(bundled);

const lines = [
  ['about', 'her', "husband's", 'death,', 'she', 'begins', 'to', 'understand'],
  ['her', 'own', 'feelings', 'and', 'the', 'quiet', 'change', 'within.'],
  ['The', 'story', 'moves', 'from', 'grief', 'toward', 'hope', 'again.']
];
const widths = [8, 6, 13, 9, 6, 9, 4, 14];
const words = [];
const svgWords = [];
lines.forEach((line, lineIndex) => {
  let x = 8;
  const y = 18 + lineIndex * 10;
  line.forEach((text, index) => {
    const w = widths[index];
    const id = `word_1_${lineIndex * 8 + index + 1}`;
    words.push({ id, text, bbox: { x, y, w, h: 3.2 }, separatorBefore: index === 0 ? '\n' : ' ' });
    svgWords.push(`<text x="${x * 10}" y="${(y + 2.65) * 12}" fill="#343947">${text.replaceAll('&', '&amp;')}</text>`);
    x += w + 1.2;
  });
});
const correction = (id, start, end, symbol, color) => ({ _id: id, submissionId: 'fixture', page: 1,
  wordIds: words.slice(start - 1, end).map((word) => word.id), symbol, color, source: 'AI', editable: false });
const dense = [
  correction('c1', 1, 4, 'P', '#d64545'), correction('c2', 5, 8, 'CAP', '#376f9b'),
  correction('c3', 9, 11, 'GR', '#7872af'), correction('c4', 12, 14, 'P', '#d64545'),
  correction('c5', 15, 17, 'SP', '#b37b23'), correction('c6', 18, 21, 'AGR', '#7872af'),
  correction('c7', 22, 24, 'P', '#d64545'), correction('c8', 7, 10, 'GR', '#7872af')
];
const light = [correction('light', 2, 4, 'P', '#d64545')];
const css = fs.readFileSync(path.join(root, 'src/app/components/correction-overlay/correction-overlay.css'), 'utf8');
const image = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1200" viewBox="0 0 1000 1200"><rect width="1000" height="1200" fill="#fffefa"/><g stroke="#dce8f1" stroke-width="1">${Array.from({ length: 25 }, (_, i) => `<path d="M40 ${180 + i * 48}H960"/>`).join('')}</g><g font-family="Segoe Print, Comic Sans MS, cursive" font-size="24">${svgWords.join('')}</g></svg>`;
const url = `data:image/svg+xml;base64,${Buffer.from(image).toString('base64')}`;
function stage(annotations, before) {
  const visuals = buildAnnotationVisuals(annotations, words, 1, 1000, 1200);
  let segments = visuals.flatMap((visual) => visual.segments);
  if (before) segments = annotations.flatMap((annotation) => annotation.wordIds.map((id, i) => {
    const box = words.find((word) => word.id === id).bbox;
    return { id: `${annotation._id}_${i}`, left: box.x, top: box.y + box.h, width: box.w,
      color: annotation.color };
  }));
  const underlines = segments.map((segment) => `<span class="correction-overlay__underline" style="left:${segment.left}%;top:${segment.top}%;width:${segment.width}%;--underline-color:${segment.color}"></span>`).join('');
  const badges = visuals.map(({ annotation, segments }) => {
    const last = segments.at(-1);
    return `<button class="correction-overlay__marker" style="--marker-left:${last.left + last.width}%;--marker-top:${last.anchorTop}%;--marker-color:${annotation.color};--marker-offset-x:0px;--marker-offset-y:0px;color:white">${annotation.symbol}</button>`;
  }).join('');
  return `<div class="correction-overlay"><div class="correction-overlay__image-stage"><img class="correction-overlay__image is-loaded" src="${url}"/>${underlines}${badges}</div></div>`;
}
const html = `<!doctype html><meta charset="utf-8"><style>${css}body{margin:0;background:#e8edf1;font:16px system-ui;padding:24px}.qa{max-width:900px;margin:auto}.label{margin:20px 0 8px;font-weight:700}.correction-overlay{min-height:0}</style><div class="qa"><div class="label">Before: per-word lines</div>${stage(dense, true)}<div class="label">After: grouped line segments</div>${stage(dense, false)}<div class="label">Light correction</div>${stage(light, false)}</div>`;
fs.writeFileSync(path.join(out, 'fixture.html'), html);

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox'] });
  try {
    for (const width of [1440, 1024, 768, 430, 390, 375]) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
      await page.goto(`file:///${path.join(out, 'fixture.html').replaceAll('\\', '/')}`);
      await page.screenshot({ path: path.join(out, `fixture-${width}.png`), fullPage: true });
      if (width === 1440 || width === 390) {
        await (await page.$$('.correction-overlay__image-stage'))[1]
          .screenshot({ path: path.join(out, `dense-after-${width}.png`) });
      }
      const data = await page.evaluate(() => {
        const stage = document.querySelectorAll('.correction-overlay__image-stage')[1];
        const image = stage.querySelector('img').getBoundingClientRect();
        const first = stage.querySelector('.correction-overlay__underline').getBoundingClientRect();
        return { imageWidth: image.width, imageHeight: image.height, firstLeft: first.left - image.left,
          firstTop: first.top - image.top, segments: stage.querySelectorAll('.correction-overlay__underline').length };
      });
      console.log(JSON.stringify({ width, ...data }));
      await page.close();
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
