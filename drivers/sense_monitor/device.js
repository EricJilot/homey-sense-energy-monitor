'use strict';

const Homey = require('homey');

class SenseMonitorDevice extends Homey.Device {
  async onInit() {
    this.log('Sense monitor device initialized');
    
    // Initialize device settings
    this.pollingInterval = this.getSetting('pollingInterval') || 30000;
    this.pollIntervalId = null;
    
    // Get authenticated session from app
    this.senseSession = this.homey.app.senseSession;
    
    if (!this.senseSession || !this.senseSession.isAuthenticated) {
      this.error('No authenticated session available. Please re-pair the device.');
      this.setUnavailable('Authentication required');
      return;
    }
    
    // Register capability listeners
    if (this.hasCapability('measure_power')) {
      this.registerCapabilityListener('measure_power', (value) => {
        this.log('measure_power capability changed:', value);
      });
    }
    
    if (this.hasCapability('meter_power')) {
      this.registerCapabilityListener('meter_power', (value) => {
        this.log('meter_power capability changed:', value);
      });
    }
    
    // Start polling
    this.startPolling();
  }

  async onAdded() {
    this.log('Sense monitor device added');
  }

  async onDeleted() {
    this.log('Sense monitor device deleted');
    this.stopPolling();
  }
  
  onSettings(oldSettings, newSettings, changedKeys) {
    this.log('Device settings changed:', changedKeys);
    
    // Handle polling interval change
    if (changedKeys.includes('pollingInterval')) {
      this.pollingInterval = newSettings.pollingInterval;
      
      // Restart polling with new interval
      this.stopPolling();
      this.startPolling();
      
      this.log('Polling interval updated to:', this.pollingInterval);
    }
    
    return true;
  }
  
  startPolling() {
    this.log('Starting polling with interval:', this.pollingInterval);
    
    // Initial poll
    this.poll();
    
    // Set up recurring polls
    this.pollIntervalId = setInterval(() => this.poll(), this.pollingInterval);
  }
  
  stopPolling() {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
      this.log('Polling stopped');
    }
  }
  
  async poll() {
    try {
      if (!this.senseSession || !this.senseSession.isAuthenticated) {
        this.error('Session lost. Device is unavailable.');
        this.setUnavailable('Session expired');
        return;
      }
      
      const monitorId = this.getData().monitorId;
      if (!monitorId) {
        this.error('Monitor ID not found in device data');
        return;
      }
      
      // Fetch real-time data for this monitor
      const realtimeData = await this.senseSession.getRealtimeData(monitorId);
      
      if (!realtimeData) {
        this.error('No real-time data received');
        this.setUnavailable('No data from Sense API');
        return;
      }
      
      // Update measure_power (current power in watts)
      if (realtimeData.watts !== undefined) {
        await this.setCapabilityValue('measure_power', realtimeData.watts);
      }
      
      // Update meter_power (cumulative energy in kWh)
      if (realtimeData.total_kwh !== undefined) {
        await this.setCapabilityValue('meter_power', realtimeData.total_kwh);
      }
      
      this.setAvailable();
      this.log('Polling successful - Power:', realtimeData.watts, 'W, Energy:', realtimeData.total_kwh, 'kWh');
    } catch (error) {
      this.error('Polling error:', error);
      this.setUnavailable(`Error: ${error.message}`);
    }
  }
}

module.exports = SenseMonitorDevice;
