# Test checklist and status

Running record of what has been exercised on real hardware (a Homey Pro and a
solar-equipped Sense monitor) and what has not. Anything not ticked has never
been run, regardless of how likely it is to work.

## Pairing and session

- [x] Sign-in with a correct email and password
- [x] Two-factor prompt appears and accepts a code
- [x] Wrong credentials produce a readable message rather than a raw 401
- [x] Monitor discovery lists the account's monitor
- [x] Solar driver offers only monitors with solar connected
- [x] Session survives an app restart without re-pairing
- [ ] Account with two or more monitors lists all of them
- [ ] Account without solar: solar driver offers nothing
- [ ] Expired or revoked session shows the re-pair message

## Live telemetry

- [x] Grid power tracks load changes
- [x] Household consumption reported separately from grid
- [x] Solar production reported on the solar device
- [x] Consumption equals grid plus solar
- [x] Grid reads negative while exporting
- [x] Figures roughly match the Sense web app
- [ ] Websocket recovers after a network interruption

## Energy totals

- [x] Imported increases over time
- [x] Exported increases while exporting
- [x] Homey Energy shows flow from both panels and grid
- [ ] Midnight rollover: all four counters continue upward rather than resetting
      (consumed, imported, exported, produced)
- [ ] Totals refresh at the configured interval

## Capabilities

- [x] New capabilities are added to already-paired devices on start
- [ ] Stale capabilities are removed from already-paired devices
      (the `measure_power.grid` rename should have logged a removal, never
      confirmed in a log)

## Settings

- [ ] Changing the energy refresh interval reschedules the refresh
- [ ] Changing the Flow threshold affects when triggers fire
- [ ] Changing the Flow delay affects how long a change must persist

## Flow cards

None of these have been exercised. The card ids, the `(args, state)` run
listener signature and the device argument filters are all reasoned from the
documentation rather than observed.

- [ ] Started exporting to the grid
- [ ] Stopped exporting to the grid
- [ ] Became self-sufficient
- [ ] Stopped being self-sufficient
- [ ] Started producing
- [ ] Stopped producing
- [ ] Has been exporting for a given duration, fires once per episode
- [ ] Has been self-sufficient for a given duration
- [ ] Has been producing for a given duration
- [ ] Is exporting / self-sufficient / producing conditions
- [ ] Duration conditions with amount and unit
- [ ] Refresh energy totals action
- [ ] The refresh action's device picker lists only this app's devices
      (it has no driver filter, so this may list unrelated devices)
- [ ] Tokens carry sensible values into a notification
- [ ] Deadband and dwell prevent flapping around the threshold in practice
- [ ] Restarting the app does not fire triggers for an already-true state

## Packaging

- [x] Validates at publish level
- [ ] Installs from a built package rather than `homey app run --remote`

## Before submitting to the app store

- [ ] Driver images replaced with recognisable photographs of the device on a
      white background. The current ones are generated placeholder shapes and
      will be rejected under guideline 1.4.
- [ ] App store images redrawn in the Sense orange `#FF8C00`; they are still
      the earlier blue.
- [ ] Store readme written to the store's constraints: plain text, no Markdown,
      no URLs, one or two paragraphs.
- [ ] Confirm the app name and description satisfy guidelines 1.1 and 1.2.

## Candidate work

**Per-appliance breakdown.** Sense's device disaggregation is unused. Every
realtime message carries a `devices` array that the app discards, and
`getMonitorDevices()` returns the detected appliances. Open question is whether
each appliance becomes its own Homey device or a capability on an existing one.

**A "has not been producing for" trigger.** The natural way to detect nightfall
or a panel fault. The condition exists, but only helps if something else
triggers the Flow.

**Retry and backoff.** Lower priority than it first appeared: the SDK reconnects
the websocket itself, so only the periodic trend requests are unprotected.

## Upstream

`sense-js-sdk` has no open issues. Two findings here are worth reporting so the
local workaround and the guesswork can be dropped:

- Extensionless CJS subpath imports break under Node's ESM resolver. Worked
  around by `scripts/patch-sense-sdk.js`.
- The published types omit every solar field Sense actually sends (`solar_w`,
  `solar_c`, `solar_pct`, `d_solar_w`, `aux`, `power_flow.solar`), and declare
  `to_grid`, `from_grid` and `solar_to_home` as `null` when the first two carry
  real numbers on a solar account.
