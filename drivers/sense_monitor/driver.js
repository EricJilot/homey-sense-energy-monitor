'use strict';

const SenseDriver = require('../../lib/SenseDriver');
const { toMilliseconds, crossed } = require('../../lib/duration');

class SenseMonitorDriver extends SenseDriver {
  async onInit() {
    await super.onInit();

    this.triggers = {
      exporting: {
        true: this.homey.flow.getDeviceTriggerCard('export_started'),
        false: this.homey.flow.getDeviceTriggerCard('export_stopped'),
      },
      selfSufficient: {
        true: this.homey.flow.getDeviceTriggerCard('self_sufficient_started'),
        false: this.homey.flow.getDeviceTriggerCard('self_sufficient_stopped'),
      },
    };

    this.homey.flow.getConditionCard('is_exporting')
      .registerRunListener(({ device }) => device.isExporting());
    this.homey.flow.getConditionCard('is_self_sufficient')
      .registerRunListener(({ device }) => device.isSelfSufficient());

    this.homey.flow.getConditionCard('has_been_exporting')
      .registerRunListener((args) => args.device.hasBeenExporting(toMilliseconds(args)));
    this.homey.flow.getConditionCard('has_been_self_sufficient')
      .registerRunListener((args) => args.device.hasBeenSelfSufficient(toMilliseconds(args)));

    this.durationTriggers = {
      exporting: this.homey.flow.getDeviceTriggerCard('exporting_for'),
      selfSufficient: this.homey.flow.getDeviceTriggerCard('self_sufficient_for'),
    };

    for (const card of Object.values(this.durationTriggers)) {
      card.registerRunListener((args, state) => crossed(args, state));
    }
  }

  exportingForTrigger() {
    return this.durationTriggers.exporting;
  }

  selfSufficientForTrigger() {
    return this.durationTriggers.selfSufficient;
  }

  exportTrigger(active) {
    return this.triggers.exporting[active];
  }

  selfSufficientTrigger(active) {
    return this.triggers.selfSufficient[active];
  }
}

module.exports = SenseMonitorDriver;
