'use strict';

const Homey = require('homey');
const { SenseApiClient } = require('sense-js-sdk');

const PAIRING_SESSION_TTL_MS = 30 * 60 * 1000;

class SenseEnergyMonitorApp extends Homey.App {
  async onInit() {
    this.log('Sense Energy Monitor app initialized');

    this.senseClients = new Map();
    this.pairingSession = null;
    this.repairTimelineMonitors = new Set();

    this.homey.flow.getActionCard('refresh_totals')
      .registerRunListener(({ device }) => device.refreshTrends());
  }

  getPairingClient() {
    const cached = this.pairingSession;
    if (!cached || cached.expiresAt <= Date.now() || !cached.client.session) {
      this.pairingSession = null;
      return null;
    }

    cached.expiresAt = Date.now() + PAIRING_SESSION_TTL_MS;
    return cached.client;
  }

  cachePairingClient(client) {
    if (!client?.session) return;

    this.pairingSession = {
      client,
      expiresAt: Date.now() + PAIRING_SESSION_TTL_MS,
    };
  }

  clearPairingClient(client) {
    if (!client || this.pairingSession?.client === client) {
      this.pairingSession = null;
    }
  }

  syncPairingSession(session) {
    const client = this.pairingSession?.client;
    if (!session || !client?.session || client.session.userId !== session.userId) return;

    client.session = session;
  }

  getSenseClient(monitorId) {
    return this.senseClients.get(String(monitorId))?.client ?? null;
  }

  async notifyRepairRequired(device) {
    const monitorId = device.getStoreValue('monitorId');
    if (monitorId == null) return;

    const key = String(monitorId);
    if (this.repairTimelineMonitors.has(key)) return;

    this.repairTimelineMonitors.add(key);
    await this.homey.notifications.createNotification({
      excerpt: `${device.getName()} needs repair to reconnect to Sense.`,
    }).catch((err) => this.error('Could not create repair Timeline notification:', err));
  }

  async notifyRepairRecovered(device) {
    const monitorId = device.getStoreValue('monitorId');
    if (monitorId == null || !this.repairTimelineMonitors.delete(String(monitorId))) return;

    await this.homey.notifications.createNotification({
      excerpt: `${device.getName()} reconnected to Sense.`,
    }).catch((err) => this.error('Could not create recovery Timeline notification:', err));
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
