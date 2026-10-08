'use strict';

const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const Module = require('node:module');
const { SenseApiClient } = require('sense-js-sdk');

const originalLoad = Module._load;
Module._load = function load(request, ...args) {
  if (request === 'homey') return { Device: class {}, Driver: class {} };
  return originalLoad.call(this, request, ...args);
};
let SenseDriver;
let SenseDevice;
let SenseSolarDevice;
try {
  SenseDriver = require('../lib/SenseDriver');
  SenseDevice = require('../lib/SenseDevice');
  SenseSolarDevice = require('../drivers/sense_solar/device');
} finally {
  Module._load = originalLoad;
}

class FakeSocket extends EventTarget {
  static instances = [];

  constructor(url) {
    super();
    this.url = url;
    FakeSocket.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  finishClose() {
    this.dispatchEvent(new Event('close'));
  }
}

function session(label) {
  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + 3600,
    userId: 'test-user',
    label,
  })).toString('base64url');
  return {
    userId: 'test-user',
    monitorIds: [42],
    accessToken: `header.${payload}.signature`,
    refreshToken: label,
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeEach((t) => {
  FakeSocket.instances = [];
  const originalSocket = globalThis.WebSocket;
  globalThis.WebSocket = FakeSocket;
  t.after(() => { globalThis.WebSocket = originalSocket; });
});

test('concurrent device starts share one websocket', async () => {
  const client = new SenseApiClient(session('initial'));
  await Promise.all([client.startRealtimeUpdates(42), client.startRealtimeUpdates(42)]);
  assert.equal(FakeSocket.instances.length, 1);
});

test('an intentional stop does not reconnect or clear the replacement socket', async () => {
  const client = new SenseApiClient(session('initial'));
  await client.startRealtimeUpdates(42);
  const oldSocket = FakeSocket.instances[0];
  await client.stopRealtimeUpdates();
  assert.equal(oldSocket.closed, true);
  await client.startRealtimeUpdates(42);
  oldSocket.finishClose();
  await settle();
  await client.startRealtimeUpdates(42);
  assert.equal(FakeSocket.instances.length, 2);
});

test('an intentional stop does not reconnect without a replacement', async () => {
  const client = new SenseApiClient(session('initial'));
  await client.startRealtimeUpdates(42);
  await client.stopRealtimeUpdates();
  FakeSocket.instances[0].finishClose();
  await settle();
  assert.equal(FakeSocket.instances.length, 1);
});

test('unexpected socket closure still reconnects', async () => {
  const client = new SenseApiClient(session('initial'));
  await client.startRealtimeUpdates(42);
  FakeSocket.instances[0].finishClose();
  await settle();
  assert.equal(FakeSocket.instances.length, 2);
});

test('failed startup can be retried after session replacement', async () => {
  const client = new SenseApiClient();
  await assert.rejects(client.startRealtimeUpdates(42));
  client.session = session('repaired');
  await client.startRealtimeUpdates(42);
  assert.equal(FakeSocket.instances.length, 1);
});

for (const mfa of [false, true]) {
  test(`repair replaces the socket and resumes both devices (${mfa ? 'MFA' : 'password'})`, async (t) => {
    const repairedSession = session('repaired');
    t.mock.method(SenseApiClient.prototype, 'login', async function login() {
      if (mfa) return 'test-mfa-token';
      this.session = repairedSession;
    });
    t.mock.method(SenseApiClient.prototype, 'completeMfaLogin', async function completeMfaLogin() {
      this.session = repairedSession;
    });

    const client = new SenseApiClient(session('initial'));
    await client.startRealtimeUpdates(42);
    const oldSocket = FakeSocket.instances[0];
    t.mock.method(client, 'getMonitorTrends', async () => ({
      start: '2026-10-08T07:00:00.000Z',
      production: { total: 12 },
    }));
    const devices = [new SenseDevice(), new SenseSolarDevice()];
    const readings = new Map();
    for (const device of devices) {
      const store = new Map([
        ['monitorId', 42],
        ['base_produced', 100],
        ['last_produced', 10],
        ['period_produced', '2026-10-08T07:00:00.000Z'],
      ]);
      device.authFailed = true;
      device.reconnectTimer = 123;
      device.client = client;
      device.monitorId = 42;
      device.homey = { app: { syncPairingSession() {} }, clearTimeout() {} };
      device.getStoreValue = (key) => store.get(key);
      device.setStoreValue = t.mock.fn(async (key, value) => { store.set(key, value); });
      device.scheduleTrendsRefresh = t.mock.fn();
      device.refreshTrends = t.mock.fn(SenseDevice.prototype.refreshTrends.bind(device));
      device.setAvailable = t.mock.fn(async () => {});
      device.getAvailable = () => true;
      device.hasCapability = () => true;
      device.getSetting = () => undefined;
      device.lastPower = {};
      device.setCapabilityValue = async (key, value) => { readings.set(key, value); };
      device.error = t.mock.fn();
      client.emitter.on('sessionChanged', device.handleSessionChanged.bind(device));
      client.emitter.on('realtimeUpdate', device.handleRealtimeUpdate.bind(device));
    }

    const device = devices[1];
    const driver = new SenseDriver();
    driver.log = () => {};
    driver.error = () => {};
    driver.homey = {
      app: {
        getSenseClient: () => client,
        cachePairingClient: t.mock.fn(),
        notifyRepairRecovered: t.mock.fn(async () => {}),
      },
    };
    const handlers = {};
    await driver.onRepair({ setHandler: (name, handler) => { handlers[name] = handler; } }, device);
    await handlers.login({ username: 'test@example.invalid', password: 'test-password' });
    if (mfa) {
      assert.equal(FakeSocket.instances.length, 1);
      await handlers.pincode('123456');
    }
    await settle();

    assert.equal(oldSocket.closed, true);
    assert.equal(FakeSocket.instances.length, 2);
    assert.equal(FakeSocket.instances[1].url.searchParams.get('access_token'), repairedSession.accessToken);
    for (const sibling of devices) {
      assert.equal(sibling.authFailed, false);
      assert.equal(sibling.reconnectTimer, null);
      assert.equal(sibling.scheduleTrendsRefresh.mock.callCount(), 1);
      assert.equal(sibling.refreshTrends.mock.callCount(), 1);
      assert.equal(sibling.error.mock.callCount(), 0);
      assert.deepEqual(sibling.setStoreValue.mock.calls[0].arguments, ['session', repairedSession]);
    }
    assert.equal(driver.homey.app.notifyRepairRecovered.mock.callCount(), 1);
    client.emitter.emit('realtimeUpdate', 42, {
      type: 'realtime_update',
      payload: { solar_w: 2400 },
    });
    await settle();
    assert.equal(readings.get('measure_power'), 2400);
    assert.equal(readings.get('meter_power'), 112);
    oldSocket.finishClose();
    await settle();
    assert.equal(FakeSocket.instances.length, 2);
  });
}
