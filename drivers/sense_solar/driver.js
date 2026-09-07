'use strict';

const SenseDriver = require('../../lib/SenseDriver');

class SenseSolarDriver extends SenseDriver {
  includeMonitor(monitor) {
    return monitor.solar_connected === true;
  }

  deviceName(monitor, monitorId) {
    return monitor?.serial_number ? `Sense Solar ${monitor.serial_number}` : `Sense Solar ${monitorId}`;
  }
}

module.exports = SenseSolarDriver;
