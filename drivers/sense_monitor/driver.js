'use strict';

const Homey = require('homey');

class SenseMonitorDriver extends Homey.Driver {
  async onInit() {
    this.log('Sense monitor driver initialized');
  }

  async onPairListDevices() {
    return [
      {
        name: 'Sense Monitor',
        data: {
          id: 'sense-monitor-main'
        }
      }
    ];
  }
}

module.exports = SenseMonitorDriver;
