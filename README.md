# Homey Sense Energy Monitor

A Homey app that integrates with the Sense Energy Monitor using the [sense-js-sdk](https://github.com/sense/sense-js-sdk) open-source library.

## Project Goals

- Stream real-time power usage from Sense Energy Monitor into Homey
- Provide accurate power metrics via Homey capabilities (`measure_power`, `meter_power`)
- Support configurable polling intervals for power data
- Maintain a stable, feature-rich Homey app package

## Architecture

This app uses a direct JavaScript-first approach powered by the `sense-js-sdk`:

- `app.json` – Homey app manifest with driver and capability definitions
- `app.js` – Homey app initialization and SDK lifecycle management
- `drivers/sense_monitor/` – Device driver handling discovery and settings
- `drivers/sense_monitor/device.js` – Device instance with polling logic and capability updates

### Data Flow

1. **App Init**: `app.js` loads the `sense-js-sdk` and makes it available to drivers
2. **Pairing**: Driver uses SDK to authenticate with Sense API and discover monitors
3. **Device Polling**: Each device instance polls Sense API on a configurable interval
4. **Capability Updates**: Power readings are mapped to Homey capabilities (`measure_power`, `meter_power`)

## Getting Started

### Prerequisites
- Node.js 18+
- Homey CLI (for development/testing)
- Sense account with an active Sense Energy Monitor

### Installation

1. Clone this repository
2. Install dependencies: `npm install`
3. Install the app on your Homey hub via Homey CLI or the app store

### Configuration

During pairing:
- **Sense Credentials**: Enter your Sense username and password
- **Polling Interval**: Configure how often (in milliseconds) to fetch power data (default: 30 seconds)

## Development

### Running Locally
```bash
npm install
homey app run
```

### Build & Release
```bash
homey app build
```

## Current Features

- ✅ Real-time power monitoring (`measure_power` in watts)
- ✅ Total energy consumption (`meter_power` in kWh)
- ✅ Configurable polling intervals
- ✅ Graceful error handling and device availability status

## Future Enhancements

- Per-circuit power breakdown
- Historical energy data
- Alerts/notifications on usage thresholds
- Additional Sense capabilities as SDK supports them

## Dependencies

- [sense-js-sdk](https://github.com/sense/sense-js-sdk) – Official Sense API JavaScript library (MIT license)
- homey – Homey framework for local app development

## License

MIT
