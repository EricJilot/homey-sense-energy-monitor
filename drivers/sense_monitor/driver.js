'use strict';

const Homey = require('homey');
const { SenseApiClient } = require('sense-js-sdk');

class SenseMonitorDriver extends Homey.Driver {
  async onInit() {
    this.log('Sense monitor driver initialized');
  }

  async onPair(session) {
    const client = new SenseApiClient();
    let mfaToken;

    session.setHandler('login', async ({ username, password }) => {
      // Resolves to a token only when the account has two-factor enabled.
      mfaToken = await client.login(username, password);
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
