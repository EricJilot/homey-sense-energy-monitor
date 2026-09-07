'use strict';

const Homey = require('homey');
const { SenseApiClient, UnauthenticatedError } = require('sense-js-sdk');
const { createSdkLogger } = require('./sdk-logger');

const DEFAULT_REFRESH_MINUTES = 5;
const MINUTE = 60 * 1000;
const DURATION_TICK_MS = 5000;
const SIGNIFICANT_WATTS = 25;
const MIN_WRITE_INTERVAL_MS = 5000;

// Shared plumbing for devices backed by a Sense monitor: session restore, the
// realtime websocket subscription, and periodic trend refreshes. Subclasses map
// the payloads onto their own capabilities.
class SenseDevice extends Homey.Device {
  async onInit() {
    this.monitorId = this.getStoreValue('monitorId');
    this.timezone = this.getStoreValue('timezone') || 'UTC';
    this.lastPower = {};
    this.lastPowerAt = {};

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

    this.durationTicker = this.homey.setInterval(() => this.onDurationTick(), DURATION_TICK_MS);

    this.log(`Monitor ${this.monitorId} initialized`);
  }

  // Subclasses map the live websocket payload onto capabilities.
  async onRealtimePower() {}

  // Subclasses map the daily trends response onto capabilities.
  async onTrends() {}

  // Subclasses fire their duration-based Flow triggers from here.
  onDurationTick() {}

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

    if (this.durationTicker) {
      this.homey.clearInterval(this.durationTicker);
      this.durationTicker = null;
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

    const rounded = Math.round(watts);
    const previous = this.lastPower[capability];

    if (previous === rounded) return;

    // Sense streams about once a second. Real changes go through at once, but
    // small drift is rate limited, otherwise Insights fills with noise and
    // Homey's built-in power trigger floods any Flow that uses it.
    const drift = previous === undefined ? Infinity : Math.abs(rounded - previous);
    const since = Date.now() - (this.lastPowerAt[capability] ?? 0);

    if (drift < SIGNIFICANT_WATTS && since < MIN_WRITE_INTERVAL_MS) return;

    this.lastPower[capability] = rounded;
    this.lastPowerAt[capability] = Date.now();
    await this.setCapabilityValue(capability, rounded);
  }

  async setEnergy(capability, kwh) {
    if (kwh === null || !this.hasCapability(capability)) return;
    await this.setCapabilityValue(capability, kwh);
  }

  // Deadband: on at or above `onAt`, off at or below `offAt`, hold between.
  // Returning null means "no opinion", which leaves the latch untouched.
  band(value, onAt, offAt = 0) {
    if (typeof value !== 'number' || Number.isNaN(value)) return null;
    if (value >= onAt) return true;
    if (value <= offAt) return false;
    return null;
  }

  // Edge detector for Flow triggers. A candidate state must persist for the
  // dwell time before it is accepted, and the first observation is adopted
  // silently so restarting the app does not fire triggers. Returns the new
  // state only on a confirmed change, otherwise null.
  trackState(key, active, dwellMs) {
    this.latches ??= {};
    const latch = (this.latches[key] ??= { state: null, candidate: null, since: 0, changedAt: 0 });

    if (active === null) {
      latch.candidate = null;
      return null;
    }

    if (latch.state === null) {
      latch.state = active;
      latch.changedAt = Date.now();
      return null;
    }

    if (latch.state === active) {
      latch.candidate = null;
      return null;
    }

    if (latch.candidate !== active) {
      latch.candidate = active;
      latch.since = Date.now();
      return null;
    }

    if (Date.now() - latch.since < dwellMs) return null;

    latch.state = active;
    latch.candidate = null;
    latch.changedAt = Date.now();
    return active;
  }

  latchState(key) {
    return this.latches?.[key]?.state ?? false;
  }

  // True once the latch has held the active state for at least the duration.
  hasHeld(key, durationMs) {
    const latch = this.latches?.[key];
    if (!latch?.state) return false;
    return Date.now() - latch.changedAt >= durationMs;
  }

  // Each Flow using a duration trigger carries its own threshold, which cannot
  // be known in advance. Tick while the state holds and hand the run listener
  // both the current and previous elapsed time, so a Flow fires on the single
  // tick where its own threshold is crossed.
  tickDuration(key, card, tokens) {
    this.tickElapsed ??= {};

    const latch = this.latches?.[key];

    if (!latch?.state) {
      this.tickElapsed[key] = 0;
      return;
    }

    const elapsed = Date.now() - latch.changedAt;
    const previousElapsed = this.tickElapsed[key] ?? 0;
    this.tickElapsed[key] = elapsed;

    if (elapsed <= previousElapsed) return;

    card.trigger(this, tokens, { elapsed, previousElapsed })
      .catch((err) => this.error('Duration trigger failed:', err));
  }

  dwellMs() {
    return (this.getSetting('flowDwellSeconds') ?? 60) * 1000;
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
