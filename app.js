'use strict';

const Homey = require('homey');

class SenseEnergyMonitorApp extends Homey.App {
  async onInit() {
    this.log('Sense Energy Monitor app initialized');

    this.homey.flow.getActionCard('refresh_totals')
      .registerRunListener(({ device }) => device.refreshTrends());
  }
}

module.exports = SenseEnergyMonitorApp;
