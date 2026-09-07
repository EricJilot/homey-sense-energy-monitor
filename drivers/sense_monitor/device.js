'use strict';

const SenseDevice = require('../../lib/SenseDevice');

// Whole-home consumption and grid exchange. `w` is gross household usage, so
// with solar running it exceeds `grid_w` by whatever the panels are supplying.
class SenseMonitorDevice extends SenseDevice {
  async onRealtimePower(payload) {
    await this.setPower('measure_power', payload.w);
    await this.setPower('measure_power.grid', payload.grid_w);
  }

  async onTrends(trends) {
    await this.setEnergy('meter_power', await this.accumulateDaily('consumed', trends.consumption?.total));
    await this.setEnergy('meter_power.imported', await this.accumulateDaily('imported', trends.from_grid));
    await this.setEnergy('meter_power.exported', await this.accumulateDaily('exported', trends.to_grid));
  }
}

module.exports = SenseMonitorDevice;
