# Porting plan: Home Assistant Sense to Homey

## Phase 1: Discovery

- Inventory Home Assistant plugin modules and dependencies
- Identify API calls, auth flow, and update cadence
- Document mapping from HA entities to Homey capabilities

## Phase 2: Python domain port

- Build python/sense_port/client.py for Sense API access
- Build python/sense_port/models.py for normalized payload models
- Add retries, backoff, and response validation
- Add tests with captured payloads in testdata

## Phase 3: Homey app integration

- Build driver lifecycle in drivers/sense_monitor/device.js
- Poll data and update Homey capabilities
- Add settings for credentials and polling interval
- Add logging and graceful degradation on API errors

## Phase 4: Production hardening

- Add richer capability coverage
- Add diagnostics endpoint and debug logs
- Validate packaging and app store readiness

## Phase 5: Release

- Tag 0.1.0 alpha
- Publish repository and open issues for incremental features
- Validate install on physical Homey hub
