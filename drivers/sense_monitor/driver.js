'use strict';

const Homey = require('homey');
const { SenseApiClient } = require('sense-js-sdk');

class SenseMonitorDriver extends Homey.Driver {
  async onInit() {
    this.log('Sense monitor driver initialized');
  }

  async onPair(session) {
    const client = new SenseApiClient(undefined, { logger: this.senseLogger() });
    let mfaToken;

    session.setHandler('login', async (credentials) => {
      const { username, password } = credentials ?? {};

      this.log(
        'Login payload keys:', Object.keys(credentials ?? {}),
        '| email length:', (username ?? '').length,
        '| password length:', (password ?? '').length,
      );

      if (!username || !password) {
        throw new Error('Email address and password are both required.');
      }

      try {
        // Resolves to a token only when the account has two-factor enabled.
        mfaToken = await client.login(username.trim(), password);
      } catch (err) {
        this.error('Sense rejected the sign-in:', err.status, err.statusText, err.message);

        if (err.status === 401) {
          throw new Error('Sense rejected that email address or password.');
        }

        throw err;
      }

      this.log(mfaToken ? 'Credentials accepted, MFA required' : 'Credentials accepted');
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
      this.log('MFA accepted');
      return true;
    });

    session.setHandler('list_devices', async () => {
      const senseSession = client.session;

      if (!senseSession) {
        throw new Error('Not signed in to Sense. Please start over.');
      }

      const devices = await Promise.all(
        senseSession.monitorIds.map((monitorId) => this.describeMonitor(client, monitorId, senseSession))
      );

      this.log(`Discovered ${devices.length} monitor(s)`);
      return devices;
    });
  }

  // The SDK reports Sense's error_reason through its logger, which is otherwise discarded.
  senseLogger() {
    return {
      debug: (message, ...meta) => this.log('[sdk]', message, ...meta),
      info: (message, ...meta) => this.log('[sdk]', message, ...meta),
      warn: (message, ...meta) => this.error('[sdk]', message, ...meta),
      error: (message, ...meta) => this.error('[sdk]', message, ...meta),
    };
  }

  async describeMonitor(client, monitorId, senseSession) {
    let serialNumber;
    let timezone = 'UTC';

    try {
      const { monitor } = (await client.getMonitorOverview(monitorId)).monitor_overview;
      serialNumber = monitor.serial_number;
      timezone = monitor.time_zone || timezone;
    } catch (err) {
      // Non-fatal: the monitor can still be paired without its overview.
      this.error(`Could not load overview for monitor ${monitorId}:`, err);
    }

    return {
      name: serialNumber ? `Sense Monitor ${serialNumber}` : `Sense Monitor ${monitorId}`,
      data: { id: String(monitorId) },
      store: { monitorId, timezone, session: senseSession },
    };
  }
}

module.exports = SenseMonitorDriver;
