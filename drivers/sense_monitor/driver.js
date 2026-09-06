'use strict';

const Homey = require('homey');
const { SenseApiClient } = require('sense-js-sdk');

class SenseMonitorDriver extends Homey.Driver {
  async onInit() {
    this.log('Sense monitor driver initialized');
  }

  async onPair(session) {
    let senseClient = new SenseApiClient();
    let mfaResponse = null;
    let authenticatedSession = null;

    // Handle login step
    session.setHandler('login', async (credentials) => {
      this.log('Attempting Sense authentication...');
      
      try {
        // Attempt authentication
        const result = await senseClient.authenticate(
          credentials.username,
          credentials.password
        );

        // Check if MFA is required
        if (result && result.status === 'mfa_required') {
          this.log('MFA required, waiting for OTP...');
          mfaResponse = result;
          
          // Proceed to MFA step
          return true;
        }

        // Authentication successful without MFA
        this.log('Authentication successful');
        authenticatedSession = senseClient;
        
        // Skip MFA step and go directly to device list
        return true;
      } catch (error) {
        this.error('Authentication error:', error);
        throw new Error(`Authentication failed: ${error.message}`);
      }
    });

    // Handle MFA step (only shown if MFA is required)
    session.setHandler('mfa', async (otp) => {
      if (!mfaResponse || !mfaResponse.mfa_token) {
        throw new Error('MFA token not available');
      }

      this.log('Completing MFA authentication...');
      
      try {
        // Complete MFA login
        await senseClient.completeMfaLogin(
          mfaResponse.mfa_token,
          otp,
          new Date()
        );

        this.log('MFA authentication successful');
        authenticatedSession = senseClient;
        return true;
      } catch (error) {
        this.error('MFA error:', error);
        throw new Error(`MFA verification failed: ${error.message}`);
      }
    });

    // Handle device list step
    session.setHandler('list_devices', async () => {
      if (!authenticatedSession || !authenticatedSession.isAuthenticated) {
        throw new Error('Not authenticated. Please retry login.');
      }

      this.log('Fetching Sense monitors...');

      try {
        // Get monitor information
        const monitorInfo = await authenticatedSession.getMonitorInfo();

        if (!monitorInfo || !monitorInfo.monitors || monitorInfo.monitors.length === 0) {
          throw new Error('No Sense monitors found on this account');
        }

        // Map monitors to Homey device format
        const devices = monitorInfo.monitors.map((monitor) => ({
          name: monitor.name || 'Sense Monitor',
          data: {
            id: monitor.id,
            monitorId: monitor.id
          },
          settings: {
            pollingInterval: 30000 // 30 seconds default
          }
        }));

        this.log(`Found ${devices.length} monitor(s)`);
        return devices;
      } catch (error) {
        this.error('Device discovery error:', error);
        throw new Error(`Failed to fetch monitors: ${error.message}`);
      }
    });

    // Store authenticated session and credentials for device use
    session.setHandler('showView', async (viewId) => {
      if (viewId === 'add_devices') {
        // Store the authenticated session in the app context
        if (authenticatedSession && authenticatedSession.isAuthenticated) {
          this.homey.app.senseSession = authenticatedSession;
        }
      }
    });
  }

  async onPairListDevices(session) {
    // This is called after successful pairing
    this.log('Device pairing completed');
    return [];
  }
}

module.exports = SenseMonitorDriver;
