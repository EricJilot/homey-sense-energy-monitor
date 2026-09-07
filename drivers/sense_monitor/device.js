'use strict';

const Homey = require('homey');
const { SenseApiClient, UnauthenticatedError } = require('sense-js-sdk');

const DEFAULT_REFRESH_MINUTES = 5;
const MINUTE = 60 * 1000;

class SenseMonitorDevice extends Homey.Device {
  async onInit() {
    this.monitorId = this.getStoreValue('monitorId');
    this.timezone = this.getStoreValue('timezone') || 'UTC';
    this.lastReportedWatts = null;

    const storedSession = this.getStoreValue('session');

    if (this.monitorId == null || !storedSession) {
      await this.setUnavailable('Sign-in data is missing. Remove this device and add it again.');
      return;
    }

    this.client = new SenseApiClient(storedSession, {
      logger: {
        debug: (message, ...meta) => this.log('[sdk]', message, ...meta),
        info: (message, ...meta) => this.log('[sdk]', message, ...meta),
        warn: (message, ...meta) => this.error('[sdk]', message, ...meta),
        error: (message, ...meta) => this.error('[sdk]', message, ...meta),
      },
    });

    this.handleSessionChanged = this.handleSessionChanged.bind(this);
    this.handleRealtimeUpdate = this.handleRealtimeUpdate.bind(this);
    this.client.emitter.on('sessionChanged', this.handleSessionChanged);
    this.client.emitter.on('realtimeUpdate', this.handleRealtimeUpdate);

    await this.connectRealtime();
    await this.refreshEnergyTotal();
    this.scheduleEnergyRefresh();

    this.log(`Sense monitor ${this.monitorId} initialized`);
  }

  async onUninit() {
    await this.teardown();
  }

  async onDeleted() {
    await this.teardown();
  }

  async onSettings({ changedKeys }) {
    if (changedKeys.includes('energyRefreshMinutes')) {
      this.scheduleEnergyRefresh();
    }
  }

  async teardown() {
    if (this.energyInterval) {
      this.homey.clearInterval(this.energyInterval);
      this.energyInterval = null;
    }

    if (!this.client) return;

    this.client.emitter.off('sessionChanged', this.handleSessionChanged);
    this.client.emitter.off('realtimeUpdate', this.handleRealtimeUpdate);

    try {
      await this.client.stopRealtimeUpdates();
    } catch (err) {
      this.error('Could not stop real-time updates:', err);
    }
  }

  handleSessionChanged(session) {
    // The SDK rotates tokens, so persist them to survive an app restart.
    this.setStoreValue('session', session ?? null)
      .catch((err) => this.error('Could not persist session:', err));
  }

  handleRealtimeUpdate(monitorId, message) {
    if (monitorId !== this.monitorId || message.type !== 'realtime_update') return;

    const watts = Math.round(message.payload?.w ?? NaN);

    // Sense streams roughly once a second; only write real changes.
    if (Number.isNaN(watts) || watts === this.lastReportedWatts) return;

    this.lastReportedWatts = watts;
    this.setCapabilityValue('measure_power', watts)
      .catch((err) => this.error('Could not set measure_power:', err));

    if (!this.getAvailable()) {
      this.setAvailable().catch((err) => this.error('Could not set available:', err));
    }
  }

  async connectRealtime() {
    try {
      await this.client.startRealtimeUpdates(this.monitorId);
      await this.setAvailable();
    } catch (err) {
      await this.handleApiError(err, 'Could not start real-time updates');
    }
  }

  scheduleEnergyRefresh() {
    if (this.energyInterval) this.homey.clearInterval(this.energyInterval);

    const minutes = this.getSetting('energyRefreshMinutes') || DEFAULT_REFRESH_MINUTES;

    this.energyInterval = this.homey.setInterval(
      () => this.refreshEnergyTotal().catch((err) => this.error('Energy refresh failed:', err)),
      minutes * MINUTE,
    );
  }

  // Sense reports energy per period rather than as a lifetime counter, so carry a
  // running base forward at midnight to keep meter_power monotonic.
  async refreshEnergyTotal() {
    try {
      const trends = await this.client.getMonitorTrends(this.monitorId, this.timezone, 'DAY');
      const today = trends?.consumption?.total;

      if (typeof today !== 'number') return;

      let base = this.getStoreValue('energyBaseKwh') || 0;
      const previous = this.getStoreValue('lastDayKwh') || 0;

      if (today < previous) {
        base += previous;
        await this.setStoreValue('energyBaseKwh', base);
      }

      await this.setStoreValue('lastDayKwh', today);
      await this.setCapabilityValue('meter_power', base + today);

      if (!this.getAvailable()) await this.setAvailable();
    } catch (err) {
      await this.handleApiError(err, 'Could not refresh energy total');
    }
  }

  async handleApiError(err, context) {
    this.error(`${context}:`, err);

    if (err instanceof UnauthenticatedError) {
      await this.setUnavailable('Sense sign-in expired. Remove this device and add it again.');
      return;
    }

    await this.setUnavailable(err.message);
  }
}

module.exports = SenseMonitorDevice;
