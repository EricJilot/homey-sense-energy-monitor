'use strict';

const SenseDevice = require('../../lib/SenseDevice');

// Homey treats this as the home's cumulative meter and derives consumption as
// grid + solar, so measure_power must be grid exchange rather than the gross
// household usage in `w`, which is exposed separately for reference.
class SenseMonitorDevice extends SenseDevice {
  async onRealtimePower(payload) {
    const grid = this.gridWatts(payload);

    await this.setPower('measure_power', grid);
    await this.setPower('measure_power.consumption', payload.w);

    this.evaluateFlows(payload, grid);
  }

  evaluateFlows(payload, grid) {
    const threshold = this.getSetting('flowThreshold') ?? 200;
    const dwell = this.dwellMs();
    const tokens = {
      grid: Math.round(grid ?? 0),
      solar: Math.round(payload.solar_w ?? 0),
      consumption: Math.round(payload.w ?? 0),
    };

    this.flowTokens = tokens;

    const exporting = this.trackState('exporting', this.band(-grid, threshold), dwell);
    if (exporting !== null) {
      this.log(exporting ? 'Started exporting to the grid' : 'Stopped exporting to the grid', tokens);
      this.driver.exportTrigger(exporting).trigger(this, tokens)
        .catch((err) => this.error('Export trigger failed:', err));
    }

    const surplus = typeof payload.solar_w === 'number' && typeof payload.w === 'number'
      ? payload.solar_w - payload.w
      : null;
    const sufficient = this.trackState('selfSufficient', this.band(surplus, threshold), dwell);
    if (sufficient !== null) {
      this.log(sufficient ? 'Became self-sufficient' : 'Stopped being self-sufficient', tokens);
      this.driver.selfSufficientTrigger(sufficient).trigger(this, tokens)
        .catch((err) => this.error('Self-sufficiency trigger failed:', err));
    }
  }

  isExporting() {
    return this.latchState('exporting');
  }
  isSelfSufficient() {
    return this.latchState('selfSufficient');
  }

  hasBeenExporting(durationMs) {
    return this.hasHeld('exporting', durationMs);
  }

  hasBeenSelfSufficient(durationMs) {
    return this.hasHeld('selfSufficient', durationMs);
  }

  onDurationTick() {
    const tokens = this.flowTokens ?? { grid: 0, solar: 0, consumption: 0 };

    this.tickDuration('exporting', this.driver.exportingForTrigger(), tokens);
    this.tickDuration('selfSufficient', this.driver.selfSufficientForTrigger(), tokens);
  }

  // Derived rather than read from grid_w, because a negative export value has
  // not been observed yet and this subtraction is signed correctly by design.
  gridWatts({ w, solar_w: solar, grid_w: grid }) {
    if (typeof w === 'number' && typeof solar === 'number') return w - solar;
    return grid;
  }

  async onTrends(trends) {
    await this.setEnergy('meter_power', await this.accumulateDaily('consumed', trends.consumption?.total));
    await this.setEnergy('meter_power.imported', await this.accumulateDaily('imported', trends.from_grid));
    await this.setEnergy('meter_power.exported', await this.accumulateDaily('exported', trends.to_grid));
  }
}

module.exports = SenseMonitorDevice;
