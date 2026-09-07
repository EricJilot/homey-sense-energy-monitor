'use strict';

// Bridges the SDK's logger interface onto a Homey Device or Driver, so Sense's
// own diagnostics (including error_reason) reach the app log.
function createSdkLogger(target) {
  return {
    debug: (message, ...meta) => target.log('[sdk]', message, ...meta),
    info: (message, ...meta) => target.log('[sdk]', message, ...meta),
    warn: (message, ...meta) => target.error('[sdk]', message, ...meta),
    error: (message, ...meta) => target.error('[sdk]', message, ...meta),
  };
}

module.exports = { createSdkLogger };
