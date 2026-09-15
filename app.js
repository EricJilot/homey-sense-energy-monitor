'use strict';

const Homey = require('homey');
const { SenseApiClient } = require('sense-js-sdk');

class SenseEnergyMonitorApp extends Homey.App {
  async onInit() {
    this.log('Sense Energy Monitor app initialized');

    this.senseClients = new Map();

    this.homey.flow.getActionCard('refresh_totals')
      .registerRunListener(({ device }) => device.refreshTrends());
  }

  // The monitor and solar devices describe the same physical Sense monitor and
  // were signed in with the same session. Sense rotates refresh tokens on every
  // renew and rejects the superseded one, so two clients renewing the same
  // session independently guarantee a 401 for whichever renews second (observed
  // in the 2026-09-10 diagnostics report). One shared client per monitor keeps
  // a single token chain and a single websocket.
  acquireSenseClient(monitorId, session, logger) {
    const key = String(monitorId);
    let entry = this.senseClients.get(key);

    if (!entry) {
      entry = { client: new SenseApiClient(session, { logger }), refs: 0 };
      this.senseClients.set(key, entry);
    }

    entry.refs += 1;
    return entry.client;
  }

  releaseSenseClient(monitorId) {
    const key = String(monitorId);
    const entry = this.senseClients.get(key);
    if (!entry) return;

    entry.refs -= 1;
    if (entry.refs > 0) return;

    this.senseClients.delete(key);
    entry.client.stopRealtimeUpdates()
      .catch((err) => this.error('Could not stop real-time updates:', err));
  }
}

module.exports = SenseEnergyMonitorApp;
