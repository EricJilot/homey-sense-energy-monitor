'use strict';

const SenseDriver = require('../../lib/SenseDriver');
const { toMilliseconds, crossed } = require('../../lib/duration');

class SenseSolarDriver extends SenseDriver {
  async onInit() {
    await super.onInit();

    this.triggers = {
      true: this.homey.flow.getDeviceTriggerCard('production_started'),
      false: this.homey.flow.getDeviceTriggerCard('production_stopped'),
    };

    this.homey.flow.getConditionCard('is_producing')
      .registerRunListener(({ device }) => device.isProducing());

    this.homey.flow.getConditionCard('has_been_producing')
      .registerRunListener((args) => args.device.hasBeenProducing(toMilliseconds(args)));

    this.durationTrigger = this.homey.flow.getDeviceTriggerCard('producing_for');
    this.durationTrigger.registerRunListener((args, state) => crossed(args, state));
  }

  producingForTrigger() {
    return this.durationTrigger;
  }

  productionTrigger(active) {
    return this.triggers[active];
  }

  includeMonitor(monitor) {
    return monitor.solar_connected === true;
  }

  deviceName(monitor, monitorId) {
    return monitor?.serial_number ? `Sense Solar ${monitor.serial_number}` : `Sense Solar ${monitorId}`;
  }
}

module.exports = SenseSolarDriver;
