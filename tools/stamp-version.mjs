#!/usr/bin/env node
/**
 * Cache-busting for static hosting (e.g. GitHub Pages caches files ~10 min, phones longer).
 * Writes a version into avatar/index.html: every local module is mapped to "file.js?v=<version>"
 * via the import map, so a browser never mixes old and new files. Also versions the
 * embed helper / avatar URLs used by the example pages.
 *
 *   node tools/stamp-version.mjs            (run before publishing; `npm run stamp`)
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
let v;
try { v = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim() + '-' + Date.now().toString(36); } catch { v = Date.now().toString(36); }

const jsDir = join(root, 'avatar/js');
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.js')) files.push(p);
  }
})(jsDir);

const imports = {
  three: './vendor/three/build/three.module.js',
  'three/addons/': './vendor/three/addons/',
};
for (const f of files.sort()) {
  const rel = './' + relative(join(root, 'avatar'), f);
  imports[rel] = `${rel}?v=${v}`;
}
const map = JSON.stringify({ imports }, null, 2).replace(/\n/g, '\n    ');

const idx = join(root, 'avatar/index.html');
let html = readFileSync(idx, 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, `<script type="importmap">\n    ${map}\n  </script>`);
html = html.replace(/<script type="module" src="js\/main\.js[^"]*"><\/script>/, `<script type="module" src="js/main.js?v=${v}"></script>`);
writeFileSync(idx, html);

for (const page of ['examples/sparkasse-app.html', 'examples/host-page.html', 'examples/sparkasse-next.html']) {
  const p = join(root, page);
  let s = readFileSync(p, 'utf8');
  s = s.replace(/src="\.\.\/embed\/sparkasse-avatar-embed\.js[^"]*"/, `src="../embed/sparkasse-avatar-embed.js?v=${v}"`);
  s = s.replace(/(['"])\.\.\/avatar\/index\.html(\?v=[^'"]*)?\1/g, `$1../avatar/index.html?v=${v}$1`);
  writeFileSync(p, s);
}
console.log(`stamped version ${v} (${files.length} modules)`);
