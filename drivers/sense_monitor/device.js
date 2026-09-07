'use strict';

const SenseDevice = require('../../lib/SenseDevice');

// Homey treats this as the home's cumulative meter and derives consumption as
// grid + solar, so measure_power must be grid exchange rather than the gross
// household usage in `w`, which is exposed separately for reference.
class SenseMonitorDevice extends SenseDevice {
  async onRealtimePower(payload) {
    await this.setPower('measure_power', this.gridWatts(payload));
    await this.setPower('measure_power.consumption', payload.w);
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
