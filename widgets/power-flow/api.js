'use strict';

// The widget has no device picker, so it reads the first device of each driver.
// An account with several monitors would only show the first.
function firstDevice(homey, driverId) {
  try {
    return Object.values(homey.drivers.getDriver(driverId).getDevices())[0];
  } catch (err) {
    return undefined;
  }
}

function reading(device, capability) {
  if (!device?.hasCapability(capability)) return null;

  const value = device.getCapabilityValue(capability);
  return typeof value === 'number' ? value : null;
}

module.exports = {
  async getFlow({ homey }) {
    const monitor = firstDevice(homey, 'sense_monitor');
    const solar = firstDevice(homey, 'sense_solar');

    return {
      paired: Boolean(monitor || solar),
      grid: reading(monitor, 'measure_power'),
      consumption: reading(monitor, 'measure_power.consumption'),
      solar: reading(solar, 'measure_power'),
    };
  },
};
