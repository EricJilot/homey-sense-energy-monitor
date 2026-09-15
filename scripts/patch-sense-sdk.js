'use strict';

// sense-js-sdk ships as ESM but imports CJS subpaths (dayjs plugins, lodash
// helpers) without a file extension. Those packages have no "exports" map, so
// Node's ESM resolver rejects the specifiers. Bundlers tolerate it; Homey's
// runtime does not. Rewrite each specifier to an explicit .js path, but only
// when the target file actually exists. Idempotent; safe to re-run.
//
// A second patch guards the websocket close handler's reconnect: the SDK calls
// startRealtimeUpdates() there without await or catch, so a failed token renew
// during a reconnect (Sense cycles the socket every ~16 minutes) becomes an
// unhandled rejection that kills the whole app. Route the failure through a
// reconnectFailed event instead, which SenseDevice listens for. The realtime
// message handler gets the same treatment: a malformed frame would otherwise
// throw straight out of the listener.

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const SDK_ROOT = path.join(PROJECT_ROOT, 'node_modules', 'sense-js-sdk');
const SDK_DIST = path.join(SDK_ROOT, 'dist');
const TARGETS = ['index.js', 'index.mjs', 'index.cjs'];

// Bare specifier with at least one subpath segment and no file extension.
const SPECIFIER = /(["'])((?:@[\w.-]+\/)?[\w.-]+(?:\/[\w.-]+)+)\1/g;

const SEARCH_PATHS = [
  path.join(SDK_ROOT, 'node_modules'),
  path.join(PROJECT_ROOT, 'node_modules'),
];

const RECONNECT_CALL = 'this.startRealtimeUpdates(monitorId);';
const RECONNECT_GUARDED = `this.startRealtimeUpdates(monitorId).catch((err) => {
          this._logger.error("Reconnect failed:", err);
          this.emitter.emit("reconnectFailed", err);
        });`;

const PARSE_CALL = `      const data = JSON.parse(event.data);
      this.emitter.emit("realtimeUpdate", monitorId, data);`;
const PARSE_GUARDED = `      try {
        this.emitter.emit("realtimeUpdate", monitorId, JSON.parse(event.data));
      } catch (err) {
        this._logger.warn("Could not handle realtime message:", err);
      }`;

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
  let result = source.replace(SPECIFIER, (match, quote, specifier) => {
    if (!resolvesWithJsExtension(specifier)) return match;
    rewritten.push(specifier);
    return `${quote}${specifier}.js${quote}`;
  });

  if (!result.includes('reconnectFailed') && result.includes(RECONNECT_CALL)) {
    result = result.replace(RECONNECT_CALL, RECONNECT_GUARDED);
    rewritten.push('guarded reconnect');
  }

  if (!result.includes('Could not handle realtime message') && result.includes(PARSE_CALL)) {
    result = result.replace(PARSE_CALL, PARSE_GUARDED);
    rewritten.push('guarded message parse');
  }

  if (result !== source) {
    fs.writeFileSync(filePath, result);
    patchedFiles += 1;
    console.log(`patch-sense-sdk: dist/${file} -> ${rewritten.join(', ')}`);
  }
}

if (patchedFiles === 0) {
  console.log('patch-sense-sdk: nothing to patch');
}
