'use strict';

const Homey = require('homey');
const { Senseable } = require('sense-js-sdk');

class SenseEnergyMonitorApp extends Homey.App {
  async onInit() {
    this.log('Sense Energy Monitor app initialized');
    
    // Store reference to the Sense SDK for use by drivers/devices
    this.senseLib = Senseable;
    
    this.homey.on('unload', () => {
      this.log('Sense Energy Monitor app unloading');
    });
  }
}

module.exports = SenseEnergyMonitorApp;
