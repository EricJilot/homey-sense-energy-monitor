# Development Roadmap: Sense Energy Monitor for Homey

This roadmap outlines the development phases for building a production-ready Homey app using the sense-js-sdk.

## Phase 1: Core Integration (Current)

- [x] Set up Homey app scaffold
- [x] Integrate sense-js-sdk
- [x] Implement basic driver pairing with credentials
- [x] Implement device polling loop
- [x] Map `measure_power` and `meter_power` capabilities
- [ ] Add credential validation and error handling in UI
- [ ] Test authentication flow end-to-end

## Phase 2: Configuration & Refinement

- [ ] Add settings UI for credentials and polling interval
- [ ] Implement secure credential storage (Homey's built-in secure store)
- [ ] Add device naming and multiple monitor support
- [ ] Improve error messages and logging
- [ ] Add connection/reconnection retry logic
- [ ] Test with physical Sense monitor

## Phase 3: Data Enrichment

- [ ] Support per-circuit power breakdown (if SDK provides)
- [ ] Add historical energy tracking capabilities
- [ ] Implement 24-hour/monthly usage summaries
- [ ] Add device-level energy estimation (if SDK supports)

## Phase 4: Advanced Features

- [ ] Add home energy insights/analytics tiles
- [ ] Implement threshold-based notifications/alarms
- [ ] Add energy usage trends/charts
- [ ] Support multiple Sense monitors per Homey hub
- [ ] Integrate with Homey automations and flows

## Phase 5: Production Hardening

- [ ] Comprehensive error handling and edge cases
- [ ] Performance optimization (memory, network, CPU)
- [ ] Security audit and credential handling review
- [ ] Full test coverage
- [ ] Extensive logging and debug support
- [ ] Documentation for troubleshooting

## Phase 6: Release & Beyond

- [ ] Package app for Homey App Store
- [ ] Publish source to GitHub
- [ ] Set up CI/CD pipeline
- [ ] Create user documentation
- [ ] Plan incremental feature releases

## Known Limitations & Future Work

- Polling interval creates a trade-off between data freshness and API rate limits
- Sense API rate limits need to be documented and respected
- Per-circuit data availability depends on Sense monitor model and SDK version
- Consider caching/local storage for offline capability updates

## Dependencies & Compatibility

- sense-js-sdk: Maintained by Sense Inc.
- Homey API: Tested against SDK 3.0+
- Node.js: 18+ required by Homey platform
