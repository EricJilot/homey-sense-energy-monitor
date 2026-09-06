'use strict';

const Homey = require('homey');
const { Senseable } = require('sense-js-sdk');

class SenseMonitorDriver extends Homey.Driver {
  async onInit() {
    this.log('Sense monitor driver initialized');
  }

  async onPairListDevices(session) {
    // Get credentials from pairing session
    const credentials = this.homey.app.senseCredentials;
    
    if (!credentials) {
      return [];
    }

    try {
      // Authenticate and fetch sense monitor info
      const auth = await Senseable.authenticate(credentials.username, credentials.password);
      
      // Return discovered monitor(s)
      return [
        {
          name: 'Sense Monitor',
          data: {
            id: auth.user_id,
            userId: auth.user_id
          },
          settings: {
            username: credentials.username,
            pollingInterval: 30000 // 30 seconds default
          }
        }
      ];
    } catch (error) {
      this.error('Error discovering devices:', error);
      return [];
    }
  }
}

module.exports = SenseMonitorDriver;
