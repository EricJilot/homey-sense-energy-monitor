'use strict';

const SenseDevice = require('../../lib/SenseDevice');

// Solar production, reported as a separate solarpanel device so Homey Energy
// counts it as generation rather than consumption.
class SenseSolarDevice extends SenseDevice {
  async onRealtimePower(payload) {
    await this.setPower('measure_power', payload.solar_w);
  }

  async onTrends(trends) {
    await this.setEnergy('meter_power', await this.accumulateDaily('produced', trends.production?.total));
  }
}

module.exports = SenseSolarDevice;
