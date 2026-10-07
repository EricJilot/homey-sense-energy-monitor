'use strict';

// Records raw Sense data to JSONL for offline comparison with the Homey timeline.
// Usage: node scripts/capture-sense.js [--hours 24] [--trends-minutes 5]

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { SenseApiClient } = require('sense-js-sdk');

const args = parseArgs(process.argv.slice(2));
const hours = Number(args.hours ?? 24);
const trendsMinutes = Number(args['trends-minutes'] ?? 5);

const outDir = path.join(__dirname, '..', 'captures');
const sessionFile = path.join(outDir, '.session.json');
fs.mkdirSync(outDir, { recursive: true });

const startedAt = new Date();
const outFile = path.join(outDir, `sense-${localStamp(startedAt).replace(/[:]/g, '-').slice(0, 19)}.jsonl`);
const out = fs.createWriteStream(outFile, { flags: 'a' });

const counts = {};

function write(kind, data) {
  counts[kind] = (counts[kind] ?? 0) + 1;
  out.write(`${JSON.stringify({ t: localStamp(new Date()), kind, ...data })}\n`);
}

const logger = {
  debug: (message, ...meta) => write('sdk', { level: 'debug', message, meta }),
  info: (message, ...meta) => write('sdk', { level: 'info', message, meta }),
  warn: (message, ...meta) => { write('sdk', { level: 'warn', message, meta }); console.warn('[sdk]', message, ...meta); },
  error: (message, ...meta) => { write('sdk', { level: 'error', message, meta }); console.error('[sdk]', message, ...meta); },
};

async function main() {
  const client = new SenseApiClient(loadSession(), { logger });

  client.emitter.on('sessionChanged', (session) => {
    if (session) fs.writeFileSync(sessionFile, JSON.stringify(session), { mode: 0o600 });
  });

  if (!client.session) await signIn(client);

  const monitorIds = client.session.monitorIds;
  const monitorId = Number(args.monitor ?? monitorIds[0]);
  const timezone = args.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

  write('start', { monitorId, monitorIds, hours, trendsMinutes, timezone });
  console.log(`Capturing monitor ${monitorId} for ${hours} h to ${outFile}`);

  client.emitter.on('realtimeUpdate', (id, message) => {
    if (id === monitorId) write('realtime', { type: message?.type, message });
  });

  const refreshTrends = async () => {
    try {
      write('trends', { trends: await client.getMonitorTrends(monitorId, timezone, 'DAY') });
    } catch (err) {
      write('error', { source: 'trends', message: err.message, status: err.status });
    }
  };

  await client.startRealtimeUpdates(monitorId);
  await refreshTrends();
  const trendsTimer = setInterval(refreshTrends, trendsMinutes * 60 * 1000);

  const statusTimer = setInterval(() => {
    console.log(`${localStamp(new Date())} ${JSON.stringify(counts)}`);
  }, 60 * 1000);

  const stop = async (reason) => {
    clearInterval(trendsTimer);
    clearInterval(statusTimer);
    clearTimeout(endTimer);
    write('stop', { reason, counts });
    try {
      await client.stopRealtimeUpdates();
    } catch (err) {
      console.error('Could not stop real-time updates:', err.message);
    }
    out.end(() => {
      console.log(`Stopped (${reason}). Wrote ${outFile}`);
      process.exit(0);
    });
  };

  const endTimer = setTimeout(() => stop('duration elapsed'), hours * 60 * 60 * 1000);
  process.once('SIGINT', () => stop('interrupted'));
}

async function signIn(client) {
  const email = process.env.SENSE_EMAIL || await ask('Sense email: ');
  const password = process.env.SENSE_PASSWORD || await ask('Sense password: ', true);
  const mfaToken = await client.login(email.trim(), password);

  if (mfaToken) {
    const code = await ask('Two-factor code: ');
    await client.completeMfaLogin(mfaToken, code.trim(), new Date());
  }
}

function loadSession() {
  try {
    return JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
  } catch {
    return undefined;
  }
}

function ask(question, hidden = false) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    rl._writeToOutput = (text) => {
      if (text.startsWith(question)) rl.output.write(question);
    };
  }
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    if (hidden) process.stdout.write('\n');
    resolve(answer);
  }));
}

// Local time with offset, to line up with the Homey timeline.
function localStamp(date) {
  const offset = -date.getTimezoneOffset();
  const pad = (n, width = 2) => String(Math.floor(Math.abs(n))).padStart(width, '0');
  const sign = offset >= 0 ? '+' : '-';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T`
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
    + `${sign}${pad(offset / 60)}:${pad(offset % 60)}`;
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) result[argv[i].slice(2)] = argv[i + 1];
  }
  return result;
}

main().catch((err) => {
  console.error('Capture failed:', err.message);
  write('error', { source: 'main', message: err.message, status: err.status });
  out.end(() => process.exit(1));
});
