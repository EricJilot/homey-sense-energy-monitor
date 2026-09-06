'use strict';

const Homey = require('homey');
const { Senseable } = require('sense-js-sdk');

class SenseMonitorDevice extends Homey.Device {
  async onInit() {
    this.log('Sense monitor device initialized');
    
    // Initialize device settings
    this.pollingInterval = this.getSetting('pollingInterval') || 30000;
    this.pollIntervalId = null;
    
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
      const username = this.getSetting('username');
      const password = this.getSetting('password');
      const userId = this.getData().userId;
      
      if (!username || !password || !userId) {
        this.error('Missing credentials or user ID');
        return;
      }
      
      // Authenticate and get real-time data
      const auth = await Senseable.authenticate(username, password);
      const data = await Senseable.getRealtime(auth, userId);
      
      // Update capabilities with latest data
      if (data && data.data && data.data.w) {
        await this.setCapabilityValue('measure_power', data.data.w);
      }
      
      if (data && data.data && data.data.total_kwh) {
        await this.setCapabilityValue('meter_power', data.data.total_kwh);
      }
      
      this.setAvailable();
    } catch (error) {
      this.error('Polling error:', error);
      this.setUnavailable(`Error: ${error.message}`);
    }
  }
}

module.exports = SenseMonitorDevice;
