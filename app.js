'use strict';

const Homey = require('homey');

class SenseEnergyMonitorApp extends Homey.App {
  async onInit() {
    this.log('Sense Energy Monitor app initialized');
    
    // Initialize session storage
    this.senseSession = null;
    
    // Handle app unload
    this.homey.on('unload', () => {
      this.log('Sense Energy Monitor app unloading');
      // Clean up session if needed
      this.senseSession = null;
    });
  }
}

module.exports = SenseEnergyMonitorApp;
