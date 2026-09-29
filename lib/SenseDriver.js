'use strict';

const Homey = require('homey');
const { SenseApiClient } = require('sense-js-sdk');
const { createSdkLogger } = require('./sdk-logger');
const { crossed } = require('./duration');

// Shared Sense sign-in and monitor discovery. Subclasses decide which monitors
// they expose and how the resulting devices are presented.
class SenseDriver extends Homey.Driver {
  // Override to expose only a subset of the account's monitors.
  includeMonitor() {
    return true;
  }

  // Override to change how a discovered monitor is named.
  deviceName(monitor, monitorId) {
    return monitor?.serial_number ? `Sense Monitor ${monitor.serial_number}` : `Sense Monitor ${monitorId}`;
  }

  // Duration triggers are offered on every tick and filtered per Flow by the
  // run listener, so log the one tick per episode where a Flow's own
  // threshold is crossed — otherwise a Flow can run without leaving a trace.
  registerDurationTrigger(card, label) {
    card.registerRunListener((args, state) => {
      const matched = crossed(args, state);
      if (matched) this.log(`${label} for ${args.amount} ${args.unit} — Flow triggered`);
      return matched;
    });
    return card;
  }

  async onPair(session) {
    const app = this.homey.app;
    let client = app.getPairingClient();
    if (!client) client = new SenseApiClient(undefined, { logger: createSdkLogger(this) });
    let mfaToken;

    session.setHandler('login', async (credentials) => {
      const { username, password } = credentials ?? {};

      if (!username || !password) {
        throw new Error('Email address and password are both required.');
      }

      try {
        // Resolves to a token only when the account has two-factor enabled.
        mfaToken = await client.login(username.trim(), password);
        if (!mfaToken) app.cachePairingClient(client);
      } catch (err) {
        if (err.status === 401) {
          throw new Error('Sense rejected that email address or password.');
        }

        throw err;
      }

      return true;
    });

    session.setHandler('showView', async (viewId) => {
      if (viewId === 'login' && client.session) {
        await session.showView('list_devices');
        return;
      }

      if (viewId === 'mfa' && !mfaToken) {
        await session.showView('list_devices');
      }
    });

    session.setHandler('pincode', async (code) => {
      const otp = Array.isArray(code) ? code.join('') : String(code).trim();
      await client.completeMfaLogin(mfaToken, otp, new Date());
      app.cachePairingClient(client);
      return true;
    });

    session.setHandler('list_devices', async () => {
      const senseSession = client.session;

      if (!senseSession) {
        throw new Error('Not signed in to Sense. Please start over.');
      }

      const candidates = await Promise.all(senseSession.monitorIds.map((monitorId) => {
        const monitorClient = app.getSenseClient(monitorId) ?? client;
        return this.describeMonitor(monitorClient, monitorId);
      }));

      const devices = candidates.filter(Boolean);
      this.log(`Discovered ${devices.length} of ${candidates.length} monitor(s)`);
      return devices;
    });
  }

  async onRepair(session, device) {
    const app = this.homey.app;
    const client = new SenseApiClient(undefined, { logger: createSdkLogger(this) });
    let mfaToken;

    const saveSession = async () => {
      const senseSession = client.session;
      const monitorId = device.getStoreValue('monitorId');

      if (!senseSession || !senseSession.monitorIds.some((id) => String(id) === String(monitorId))) {
        throw new Error('The signed-in Sense account does not include this monitor.');
      }

      const monitorClient = app.getSenseClient(monitorId);
      if (monitorClient) monitorClient.session = senseSession;

      await device.setStoreValue('session', monitorClient?.session ?? senseSession);
      app.cachePairingClient(client);
      await device.setAvailable();
    };

    session.setHandler('login', async (credentials) => {
      const { username, password } = credentials ?? {};
      if (!username || !password) {
        throw new Error('Email address and password are both required.');
      }

      try {
        mfaToken = await client.login(username.trim(), password);
        if (!mfaToken) await saveSession();
      } catch (err) {
        if (err.status === 401) {
          throw new Error('Sense rejected that email address or password.');
        }
        throw err;
      }

      return true;
    });

    session.setHandler('showView', async (viewId) => {
      if (viewId === 'mfa' && !mfaToken) await session.showView('done');
    });

    session.setHandler('pincode', async (code) => {
      const otp = Array.isArray(code) ? code.join('') : String(code).trim();
      await client.completeMfaLogin(mfaToken, otp, new Date());
      await saveSession();
      return true;
    });
  }

  async describeMonitor(client, monitorId) {
    let monitor;

    try {
      monitor = (await client.getMonitorOverview(monitorId)).monitor_overview.monitor;
    } catch (err) {
      if (err?.status === 401) {
        this.homey.app.clearPairingClient();
        throw new Error('Sense sign-in expired. Start pairing again to authenticate.');
      }

      // Non-fatal, but without the overview we cannot evaluate includeMonitor().
      this.error(`Could not load overview for monitor ${monitorId}:`, err);
    }

    if (monitor && !this.includeMonitor(monitor)) return null;

    return {
      name: this.deviceName(monitor, monitorId),
      data: { id: String(monitorId) },
      store: {
        monitorId,
        timezone: monitor?.time_zone || 'UTC',
        session: client.session,
      },
    };
  }
}

module.exports = SenseDriver;
