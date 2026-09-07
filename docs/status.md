# Status and roadmap

## Verified on hardware

Tested against a Homey Pro and a solar-equipped Sense monitor.

- Sign-in including two-factor, and monitor discovery
- Session persistence across app restarts, without re-pairing
- Live grid, household consumption and solar production over the websocket
- Import and export energy totals, both confirmed increasing
- Export reads negative on the grid capability
- Homey Energy shows flow from both panels and grid, matching the Sense web app

## Not yet verified

- Midnight rollover of the four accumulated counters (consumed, imported,
  exported, produced)
- Behaviour with more than one monitor on an account
- Behaviour on an account without solar, where the solar driver should offer
  nothing

## Before publishing

- Driver images at 75x75 and 500x500 for each driver. This is the only
  outstanding `homey app validate --level publish` failure.
- App store images are placeholders and still use the pre-rebrand blue; the
  brand colour is Sense orange `#FF8C00`.
- Readme text for the store listing, which has different constraints from this
  repository's readme: no Markdown, no URLs, one or two paragraphs.

## Candidate work

**Per-appliance breakdown.** Sense's device disaggregation is its distinguishing
feature and is currently unused. Every realtime message carries a `devices`
array that the app discards, and `getMonitorDevices()` returns the detected
appliances. The open question is whether each appliance becomes its own Homey
device or a capability on an existing one.

**Flow cards.** The app defines none. Triggers such as export starting, or
consumption crossing a threshold, would make the data usable in automations.

**Solar curtailment.** Homey supports `target_power` on `solarpanel` devices,
but this depends on inverter control that Sense does not provide, so it is
likely out of scope.

**Retry and backoff.** Lower priority than it first appeared: the SDK already
reconnects the websocket automatically, so only the periodic trend requests are
unprotected.

## Upstream

`sense-js-sdk` has no open issues. Two findings from this work are worth
reporting so the local workaround and the guesswork can be removed:

- Extensionless CJS subpath imports break under Node's ESM resolver. Worked
  around by `scripts/patch-sense-sdk.js`.
- The published types omit every solar field that Sense actually sends
  (`solar_w`, `solar_c`, `solar_pct`, `d_solar_w`, `aux`, `power_flow.solar`),
  and declare `to_grid`, `from_grid` and `solar_to_home` as `null` when the
  first two carry real numbers on a solar account.
