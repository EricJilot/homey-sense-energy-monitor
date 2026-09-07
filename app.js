'use strict';

const Homey = require('homey');

class SenseEnergyMonitorApp extends Homey.App {
  async onInit() {
    this.log('Sense Energy Monitor app initialized');
  }
}

module.exports = SenseEnergyMonitorApp;
