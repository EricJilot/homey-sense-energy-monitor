'use strict';

const Homey = require('homey');

class SenseMonitorDevice extends Homey.Device {
  async onInit() {
    this.log('Sense monitor device initialized');
  }

  async onAdded() {
    this.log('Sense monitor device added');
  }

  async onDeleted() {
    this.log('Sense monitor device deleted');
  }
}

module.exports = SenseMonitorDevice;
