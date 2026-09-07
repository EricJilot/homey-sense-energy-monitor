'use strict';

// sense-js-sdk ships as ESM but imports CJS subpaths (dayjs plugins, lodash
// helpers) without a file extension. Those packages have no "exports" map, so
// Node's ESM resolver rejects the specifiers. Bundlers tolerate it; Homey's
// runtime does not. Rewrite each specifier to an explicit .js path, but only
// when the target file actually exists. Idempotent; safe to re-run.

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const SDK_ROOT = path.join(PROJECT_ROOT, 'node_modules', 'sense-js-sdk');
const SDK_DIST = path.join(SDK_ROOT, 'dist');
const TARGETS = ['index.js', 'index.mjs'];

// Bare specifier with at least one subpath segment and no file extension.
const SPECIFIER = /(["'])((?:@[\w.-]+\/)?[\w.-]+(?:\/[\w.-]+)+)\1/g;

const SEARCH_PATHS = [
  path.join(SDK_ROOT, 'node_modules'),
  path.join(PROJECT_ROOT, 'node_modules'),
];

function resolvesWithJsExtension(specifier) {
  if (specifier.startsWith('.') || path.extname(specifier)) return false;
  return SEARCH_PATHS.some((base) => fs.existsSync(path.join(base, `${specifier}.js`)));
}

let patchedFiles = 0;

for (const file of TARGETS) {
  const filePath = path.join(SDK_DIST, file);

  if (!fs.existsSync(filePath)) continue;

  const rewritten = [];
  const source = fs.readFileSync(filePath, 'utf8');
  const result = source.replace(SPECIFIER, (match, quote, specifier) => {
    if (!resolvesWithJsExtension(specifier)) return match;
    rewritten.push(specifier);
    return `${quote}${specifier}.js${quote}`;
  });

  if (result !== source) {
    fs.writeFileSync(filePath, result);
    patchedFiles += 1;
    console.log(`patch-sense-sdk: dist/${file} -> ${rewritten.join(', ')}`);
  }
}

if (patchedFiles === 0) {
  console.log('patch-sense-sdk: nothing to patch');
}
