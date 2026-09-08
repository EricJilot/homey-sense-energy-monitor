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

  async onPair(session) {
    const client = new SenseApiClient(undefined, { logger: createSdkLogger(this) });
    let mfaToken;

    session.setHandler('login', async (credentials) => {
      const { username, password } = credentials ?? {};

      if (!username || !password) {
        throw new Error('Email address and password are both required.');
      }

      try {
        // Resolves to a token only when the account has two-factor enabled.
        mfaToken = await client.login(username.trim(), password);
      } catch (err) {
        if (err.status === 401) {
          throw new Error('Sense rejected that email address or password.');
        }

        throw err;
      }

      return true;
    });

    session.setHandler('showView', async (viewId) => {
      if (viewId === 'mfa' && !mfaToken) {
        await session.showView('list_devices');
      }
    });

    session.setHandler('pincode', async (code) => {
      const otp = Array.isArray(code) ? code.join('') : String(code).trim();
      await client.completeMfaLogin(mfaToken, otp, new Date());
      return true;
    });

    session.setHandler('list_devices', async () => {
      const senseSession = client.session;

      if (!senseSession) {
        throw new Error('Not signed in to Sense. Please start over.');
      }

      const candidates = await Promise.all(
        senseSession.monitorIds.map((monitorId) => this.describeMonitor(client, monitorId, senseSession))
      );

      const devices = candidates.filter(Boolean);
      this.log(`Discovered ${devices.length} of ${candidates.length} monitor(s)`);
      return devices;
    });
  }

  async describeMonitor(client, monitorId, senseSession) {
    let monitor;

    try {
      monitor = (await client.getMonitorOverview(monitorId)).monitor_overview.monitor;
    } catch (err) {
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
        session: senseSession,
      },
    };
  }
}

module.exports = SenseDriver;
