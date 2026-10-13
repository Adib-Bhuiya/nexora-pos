// Post-build step: turns scripts/sw.template.js into out/sw.js with a precache list of every exported file.
// Plain Node (no dependencies) so it runs the same on Windows, macOS and Linux.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const OUT = 'out';
if (!existsSync(OUT)) {
  console.error('✗ "out/" not found. Run `next build` first (npm run build does both).');
  process.exit(1);
}

const INCLUDE = /\.(html|js|css|svg|png|ico|webmanifest|txt|json|woff2?)$/i;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else files.push(full);
  }
})(OUT);

const urls = [];
const hash = createHash('sha256');
for (const file of files.sort()) {
  const rel = relative(OUT, file).split(sep).join('/');
  if (rel === 'sw.js' || rel.endsWith('.map') || !INCLUDE.test(rel)) continue;
  hash.update(rel).update(readFileSync(file));
  if (rel === 'index.html') urls.push('/');
  else if (rel.endsWith('/index.html')) urls.push('/' + encodeURI(rel.slice(0, -'index.html'.length)));
  else urls.push('/' + encodeURI(rel));
}

const version = hash.digest('hex').slice(0, 12);
const template = readFileSync(join('scripts', 'sw.template.js'), 'utf8');
writeFileSync(join(OUT, 'sw.js'), template.replace('__VERSION__', version).replace('__ASSETS__', JSON.stringify(urls, null, 2)));
console.log(`✓ service worker written to out/sw.js — ${urls.length} files precached (version ${version})`);
