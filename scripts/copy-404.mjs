#!/usr/bin/env node
// GitHub Pages has no rewrite rules, so a pushState deep link such as
// /music-discographies/artist/maroon-5 returns 404 on refresh or when shared.
// Pages serves 404.html for any unmatched path, so an identical copy of
// index.html there lets the Angular router boot and resolve the route itself.
// This is why the app does NOT use hash routing.

import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// @angular/build writes the browser bundle to dist/<project>/browser.
function findIndexHtml() {
  const dist = join(ROOT, 'dist');
  if (!existsSync(dist)) return null;
  for (const project of readdirSync(dist)) {
    for (const candidate of [join(dist, project, 'browser'), join(dist, project)]) {
      const indexPath = join(candidate, 'index.html');
      if (existsSync(indexPath) && statSync(indexPath).isFile()) return indexPath;
    }
  }
  return null;
}

const indexPath = findIndexHtml();
if (!indexPath) {
  console.error('copy-404: no dist/**/index.html found. Run the build first.');
  process.exit(1);
}

const notFoundPath = join(dirname(indexPath), '404.html');
copyFileSync(indexPath, notFoundPath);
console.log(`copy-404: ${indexPath} -> ${notFoundPath}`);
