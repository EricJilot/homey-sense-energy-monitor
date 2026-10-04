# Homey Verification

- [x] Run `npx homey app validate --level debug` after installing dependencies.
      Passed at the stricter `publish` level, 2026-10-03, after re-running
      `scripts/patch-sense-sdk.js` (a fresh npm install had left the SDK
      unpatched).
- [ ] Pair Sense Monitor, then Sense Solar; confirm the second driver reuses
      the authenticated session without another login or MFA prompt.
- [ ] Repair a device with an expired/revoked session; confirm the same Homey
      device remains and cumulative energy values do not reset.
- [ ] Repair one device and confirm its sibling for the same monitor resumes.
- [ ] Reboot Homey after repair and confirm both devices restore their sessions.
- [ ] Confirm grid export, producing and self-sufficiency transitions create
      one Timeline entry each, with the correct device name and no repeats.
      Observed on 2026-10-04: Started Producing, Became Self-Sufficient and
      exporting to grid. Device-name and duplicate checks remain.
- [ ] Confirm one needs-repair entry appears per monitor after auth failure,
      followed by one recovery entry after successful repair.

# Sentry Diagnostics

- [ ] Confirm the Homey runtime supports the chosen `@sentry/node` version;
      install it with npm and commit the regenerated lockfile.
- [ ] Create/select the Sentry Node.js project and configure its DSN without
      including Sense credentials or refresh/access tokens in source control.
- [ ] Implement opt-in reporting, disabled by default; capture only selected,
      sanitized failures and rate-limit repeats.
- [ ] Verify captured events contain no email, monitor/device IDs, API payloads,
      request data, or authentication tokens.
- [ ] Test that reporting sends an event when enabled and sends nothing when
      disabled; verify duplicate failures are bounded by sampling/rate limits.
- [ ] Document the opt-in and data handling in app documentation; omit this
      operational change from the Homey store changelog as requested.