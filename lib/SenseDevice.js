'use strict';

const Homey = require('homey');
const { SenseApiClient, UnauthenticatedError } = require('sense-js-sdk');
const { createSdkLogger } = require('./sdk-logger');

const DEFAULT_REFRESH_MINUTES = 5;
const MINUTE = 60 * 1000;

// Shared plumbing for devices backed by a Sense monitor: session restore, the
// realtime websocket subscription, and periodic trend refreshes. Subclasses map
// the payloads onto their own capabilities.
class SenseDevice extends Homey.Device {
  async onInit() {
    this.monitorId = this.getStoreValue('monitorId');
    this.timezone = this.getStoreValue('timezone') || 'UTC';
    this.lastPower = {};

    const storedSession = this.getStoreValue('session');

    if (this.monitorId == null || !storedSession) {
      await this.setUnavailable('Sign-in data is missing. Remove this device and add it again.');
      return;
    }

    await this.ensureCapabilities();

    this.client = new SenseApiClient(storedSession, { logger: createSdkLogger(this) });

    this.handleSessionChanged = this.handleSessionChanged.bind(this);
    this.handleRealtimeUpdate = this.handleRealtimeUpdate.bind(this);
    this.client.emitter.on('sessionChanged', this.handleSessionChanged);
    this.client.emitter.on('realtimeUpdate', this.handleRealtimeUpdate);

    await this.connectRealtime();
    await this.refreshTrends();
    this.scheduleTrendsRefresh();

    this.log(`Monitor ${this.monitorId} initialized`);
  }

  // Subclasses map the live websocket payload onto capabilities.
  async onRealtimePower() {}

  // Subclasses map the daily trends response onto capabilities.
  async onTrends() {}

  async onUninit() {
    await this.teardown();
  }

  async onDeleted() {
    await this.teardown();
  }

  async onSettings({ changedKeys }) {
    if (changedKeys.includes('energyRefreshMinutes')) {
      this.scheduleTrendsRefresh();
    }
  }

  // Homey neither adds nor removes capabilities on already-paired devices when
  // the manifest changes, so reconcile both directions on every start.
  async ensureCapabilities() {
    const declared = this.driver.manifest?.capabilities ?? [];

    for (const capability of declared) {
      if (this.hasCapability(capability)) continue;

      await this.addCapability(capability);
      this.log(`Added capability ${capability}`);
    }

    for (const capability of this.getCapabilities()) {
      if (declared.includes(capability)) continue;

      await this.removeCapability(capability);
      this.log(`Removed capability ${capability}`);
    }
  }

  async teardown() {
    if (this.trendsInterval) {
      this.homey.clearInterval(this.trendsInterval);
      this.trendsInterval = null;
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
    if (monitorId !== this.monitorId || message.type !== 'realtime_update' || !message.payload) return;

    Promise.resolve(this.onRealtimePower(message.payload))
      .catch((err) => this.error('Could not apply real-time update:', err));

    if (!this.getAvailable()) {
      this.setAvailable().catch((err) => this.error('Could not set available:', err));
    }
  }

  async setPower(capability, watts) {
    if (typeof watts !== 'number' || Number.isNaN(watts)) return;
    if (!this.hasCapability(capability)) return;

    // Sense streams roughly once a second; only write real changes.
    const rounded = Math.round(watts);
    if (this.lastPower[capability] === rounded) return;

    this.lastPower[capability] = rounded;
    await this.setCapabilityValue(capability, rounded);
  }

  async setEnergy(capability, kwh) {
    if (kwh === null || !this.hasCapability(capability)) return;
    await this.setCapabilityValue(capability, kwh);
  }

  // Sense reports energy per period rather than as a lifetime counter, so carry
  // a running base forward at midnight to keep meter capabilities monotonic.
  async accumulateDaily(key, todayValue) {
    if (typeof todayValue !== 'number' || Number.isNaN(todayValue)) return null;

    const baseKey = `base_${key}`;
    const lastKey = `last_${key}`;
    let base = this.getStoreValue(baseKey) || 0;
    const previous = this.getStoreValue(lastKey) || 0;

    if (todayValue < previous) {
      base += previous;
      await this.setStoreValue(baseKey, base);
    }

    await this.setStoreValue(lastKey, todayValue);
    return base + todayValue;
  }

  async connectRealtime() {
    try {
      await this.client.startRealtimeUpdates(this.monitorId);
      await this.setAvailable();
    } catch (err) {
      await this.handleApiError(err, 'Could not start real-time updates');
    }
  }

  scheduleTrendsRefresh() {
    if (this.trendsInterval) this.homey.clearInterval(this.trendsInterval);

    const minutes = this.getSetting('energyRefreshMinutes') || DEFAULT_REFRESH_MINUTES;

    this.trendsInterval = this.homey.setInterval(
      () => this.refreshTrends().catch((err) => this.error('Trends refresh failed:', err)),
      minutes * MINUTE,
    );
  }

  async refreshTrends() {
    try {
      const trends = await this.client.getMonitorTrends(this.monitorId, this.timezone, 'DAY');

      if (trends) await this.onTrends(trends);
      if (!this.getAvailable()) await this.setAvailable();
    } catch (err) {
      await this.handleApiError(err, 'Could not refresh energy totals');
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

module.exports = SenseDevice;
