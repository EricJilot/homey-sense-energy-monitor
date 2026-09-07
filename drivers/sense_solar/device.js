'use strict';

const SenseDevice = require('../../lib/SenseDevice');

// Solar production, reported as a separate solarpanel device so Homey Energy
// counts it as generation rather than consumption.
class SenseSolarDevice extends SenseDevice {
  async onRealtimePower(payload) {
    const watts = payload.solar_w;

    await this.setPower('measure_power', watts);

    const threshold = this.getSetting('flowThreshold') ?? 50;
    const producing = this.trackState('producing', this.band(watts, threshold), this.dwellMs());

    if (producing !== null) {
      this.driver.productionTrigger(producing).trigger(this, { power: Math.round(watts) })
        .catch((err) => this.error('Production trigger failed:', err));
    }
  }

  isProducing() {
    return this.latchState('producing');
  }

  hasBeenProducing(durationMs) {
    return this.hasHeld('producing', durationMs);
  }

  onDurationTick() {
    this.tickDuration('producing', this.driver.producingForTrigger(), {
      power: this.lastPower?.measure_power ?? 0,
    });
  }

  async onTrends(trends) {
    await this.setEnergy('meter_power', await this.accumulateDaily('produced', trends.production?.total));
  }
}

module.exports = SenseSolarDevice;
