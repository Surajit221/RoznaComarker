'use strict';
// Publish only hashes of built public assets, never environment or source content.
// Runs after every production build (npm run build:prod -> postbuild:prod). It writes:
//   release.json  { releaseId, assets }  (unchanged format)
//   version.json  { releaseId }          the tiny file open tabs poll to detect a new deployment (served with no-cache)
//   index.html    <meta name="app-release" content="..."> so the running page knows which release it is
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const dir = path.resolve(__dirname, '../dist/rozna-comarker-fe/browser');
const assets = fs.readdirSync(dir).filter(name => /^(main|polyfills|styles)-[A-Za-z0-9]+\.(js|css)$/.test(name)).sort();
if (!assets.some(name => name.startsWith('main-'))) throw Error('Production bundle missing');
const hashes = Object.fromEntries(assets.map(name => [name, createHash('sha256').update(fs.readFileSync(path.join(dir,name))).digest('hex')]));
const releaseId = createHash('sha256').update(JSON.stringify(hashes)).digest('hex').slice(0,24);
fs.writeFileSync(path.join(dir,'release.json'), JSON.stringify({ releaseId, assets: hashes }, null, 2) + '\n');
fs.writeFileSync(path.join(dir,'version.json'), JSON.stringify({ releaseId }) + '\n');

// Every HTML entry the build produced gets the same release id (index.html, plus any prerendered pages).
const meta = `<meta name="app-release" content="${releaseId}">`;
const htmlFiles = [];
(function walk(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) htmlFiles.push(full);
  }
})(dir);
if (!htmlFiles.some(file => path.basename(file) === 'index.html')) throw Error('index.html missing');
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8').replace(/<meta name="app-release" content="[^"]*">\s*/g, '');
  if (!/<head[^>]*>/i.test(html)) continue;
  fs.writeFileSync(file, html.replace(/<head[^>]*>/i, head => `${head}${meta}`));
}
console.log(JSON.stringify({ releaseId, htmlStamped: htmlFiles.length }));
