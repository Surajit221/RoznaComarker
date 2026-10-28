'use strict';
// Publish only hashes of built public assets, never environment or source content.
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const dir = path.resolve(__dirname, '../dist/rozna-comarker-fe/browser');
const assets = fs.readdirSync(dir).filter(name => /^(main|polyfills|styles)-[A-Za-z0-9]+\.(js|css)$/.test(name)).sort();
if (!assets.some(name => name.startsWith('main-'))) throw Error('Production bundle missing');
const hashes = Object.fromEntries(assets.map(name => [name, createHash('sha256').update(fs.readFileSync(path.join(dir,name))).digest('hex')]));
const releaseId = createHash('sha256').update(JSON.stringify(hashes)).digest('hex').slice(0,24);
fs.writeFileSync(path.join(dir,'release.json'), JSON.stringify({ releaseId, assets: hashes }, null, 2) + '\n');
console.log(JSON.stringify({ releaseId }));
