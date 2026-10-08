'use strict';

// sense-js-sdk ships as ESM but imports CJS subpaths (dayjs plugins, lodash
// helpers) without a file extension. Those packages have no "exports" map, so
// Node's ESM resolver rejects the specifiers. Bundlers tolerate it; Homey's
// runtime does not. Rewrite each specifier to an explicit .js path, but only
// when the target file actually exists. Idempotent; safe to re-run.
//
// Another patch serializes token renewal: API calls and websocket reconnects
// can overlap while Sense rotates a single-use refresh token. They must share
// one renewal request and its resulting access/refresh token pair.
//
// A separate patch guards the websocket close handler's reconnect: the SDK calls
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

const REFRESH_METHOD = `async refreshAccessTokenIfNeeded() {
    if (!this.session) {`;
const REFRESH_SINGLE_FLIGHT = `async refreshAccessTokenIfNeeded() {
    if (this._refreshPromise) return this._refreshPromise;

    this._refreshPromise = this.refreshAccessTokenIfNeededInternal();
    try {
      return await this._refreshPromise;
    } finally {
      this._refreshPromise = undefined;
    }
  }

  async refreshAccessTokenIfNeededInternal() {
    if (!this.session) {`;

const START_METHOD = 'async startRealtimeUpdates(monitorId) {';
const START_SINGLE_FLIGHT = `async startRealtimeUpdates(monitorId) {
    if (this._realtimeStartPromise) return this._realtimeStartPromise;

    this._realtimeStartPromise = this.startRealtimeUpdatesInternal(monitorId);
    try {
      return await this._realtimeStartPromise;
    } finally {
      this._realtimeStartPromise = undefined;
    }
  }

  async startRealtimeUpdatesInternal(monitorId) {`;

const SOCKET_CREATE = 'this._socket = new WebSocket(url);';
const SOCKET_CAPTURE = `const socket = new WebSocket(url);
    this._socket = socket;`;
const SOCKET_CLOSE = 'this._socket.addEventListener("close", () => {';
const SOCKET_CLOSE_GUARDED = `this._socket.addEventListener("close", () => {
      if (this._socket !== socket) return;`;
const SOCKET_STOP = `this._socket.close();
      this._socket = void 0;
      this._socketIsConnecting = false;`;
const SOCKET_STOP_DETACHED = `const socket = this._socket;
      this._socket = void 0;
      this._socketIsConnecting = false;
      socket.close();`;

function patchRequired(source, before, after, marker) {
  if (source.includes(marker)) return source;
  if (!source.includes(before)) {
    throw new Error(`patch-sense-sdk: unsupported SDK source for ${marker}`);
  }
  return source.replace(before, after);
}

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

  if (!result.includes('refreshAccessTokenIfNeededInternal') && result.includes(REFRESH_METHOD)) {
    result = result.replace(REFRESH_METHOD, REFRESH_SINGLE_FLIGHT);
    rewritten.push('serialized token refresh');
  }

  // Both devices resume on sessionChanged. Share their start request, and keep
  // intentional stops (repair or teardown) from auto-reconnecting an old socket.
  result = patchRequired(result, START_METHOD, START_SINGLE_FLIGHT, 'startRealtimeUpdatesInternal');
  result = patchRequired(result, SOCKET_CREATE, SOCKET_CAPTURE, 'const socket = new WebSocket(url);');
  result = patchRequired(result, SOCKET_CLOSE, SOCKET_CLOSE_GUARDED, 'if (this._socket !== socket) return;');
  result = patchRequired(result, SOCKET_STOP, SOCKET_STOP_DETACHED, 'const socket = this._socket;');
  if (result !== source) rewritten.push('repair-safe websocket lifecycle');

  if (result !== source) {
    fs.writeFileSync(filePath, result);
    patchedFiles += 1;
    console.log(`patch-sense-sdk: dist/${file} -> ${rewritten.join(', ')}`);
  }
}

if (patchedFiles === 0) {
  console.log('patch-sense-sdk: nothing to patch');
}
