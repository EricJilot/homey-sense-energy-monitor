# Homey Verification

- [ ] Run `npx homey app validate --level debug` after installing dependencies.
- [ ] Pair Sense Monitor, then Sense Solar; confirm the second driver reuses
      the authenticated session without another login or MFA prompt.
- [ ] Repair a device with an expired/revoked session; confirm the same Homey
      device remains and cumulative energy values do not reset.
- [ ] Repair one device and confirm its sibling for the same monitor resumes.
- [ ] Reboot Homey after repair and confirm both devices restore their sessions.