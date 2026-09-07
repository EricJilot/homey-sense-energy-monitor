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
- [x] Session survives a hub reboot, with devices reconnecting on their own
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
- [x] Websocket recovers after an interruption. Sense cycles the connection
      roughly every sixteen minutes and the SDK reconnects in about 250ms
      without intervention, so this happens continuously in normal use.

## Energy totals

- [x] Imported increases over time
- [x] Exported increases while exporting
- [x] Homey Energy shows flow from both panels and grid
- [x] Accumulated totals survive a hub reboot rather than restarting from zero
- [ ] Midnight rollover: all four counters continue upward rather than resetting
      (consumed, imported, exported, produced)
- [x] Totals refresh at the configured interval. Observed exactly five minutes
      apart on both devices at the default setting.

## Capabilities

- [x] New capabilities are added to already-paired devices on start
- [x] Stale capabilities are removed from already-paired devices. Confirmed by
      absence: a later start logged no removal for `measure_power.grid`, which
      it would have done had the capability still been present.

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
- [x] Refresh energy totals action, fired manually against both devices, each
      resolving to its own device
- [x] The refresh action's device picker lists only this app's devices, despite
      having no driver filter, so Homey scopes device arguments to the owning app
- [ ] Tokens carry sensible values into a notification
- [ ] Deadband and dwell prevent flapping around the threshold in practice
- [ ] Restarting the app does not fire triggers for an already-true state

## Widget

- [x] Appears in the widget picker and renders on a dashboard
- [x] Grid, home and solar values shown, and readable at widget size
- [x] Flow animation direction matches the actual power direction
- [x] Fits the widget frame without clipping
- [ ] Behaviour when no devices are paired
- [ ] Behaviour on an account without solar, where the solar node has no value
- [ ] Previews replaced. They are still the generated Homey placeholders and
      will be rejected under guideline 1.10, which wants simple shapes with no
      text, in light and dark.

## Packaging

- [x] Validates at publish level
- [x] A `--remote` install persists after the CLI exits and across a hub reboot,
      so it is a real install rather than a session tied to the terminal
- [ ] Published to Test, which would confirm whether the diagnostics report
      button appears only for store-installed apps

## Before submitting to the app store

- [x] Checked the store for an existing Sense app, as guideline 2.1.1 requires.
      None found, so there is no other developer to coordinate with.
- [x] Description rewritten, icons redrawn on the 960x960 canvas with
      transparent backgrounds, and readme.txt added.
- [ ] Driver images replaced with recognisable photographs of the device on a
      white background. The current ones are generated placeholder shapes and
      will be rejected under guideline 1.4.
- [ ] App store images redrawn in the Sense orange `#F9461C`; they are still
      the earlier blue.
- [ ] Store readme written to the store's constraints: plain text, no Markdown,
      no URLs, one or two paragraphs.
- [ ] Confirm the app name and description satisfy guidelines 1.1 and 1.2.

## Candidate work

**Per-appliance breakdown. Decided against, 2026-09-07.** Sense exposes
detected appliances through `getMonitorDevices()` and the `devices` array in
each realtime message, which the app discards. Surfacing them was considered
and rejected: the whole-home and solar figures come from current clamps and are
measurements, whereas per-appliance values are inferred from load signatures.
Homey also offers no way to attach that data to an existing device, since apps
cannot write capabilities onto devices they do not own, so each appliance would
arrive as a duplicate alongside its real counterpart and would need excluding
from Energy on one side or the other to avoid being subtracted twice from the
cumulative meter. Real per-device measurement is the better source. Revisit only
if Sense's attribution improves markedly.

**Throttling measure_power.** The capability is written whenever the rounded
watt value changes, which on a live house is roughly once a second per device,
or around 170,000 writes a day. Every write lands in Insights, and it makes
Homey's built-in power changed trigger unusable: adding it to a Flow floods the
timeline. Writing immediately on a meaningful change, say 25W, and otherwise at
most once every few seconds would keep the app responsive while giving Insights
sensible granularity. Costs second-by-second history that is unlikely to be
wanted.

**Per-Flow power thresholds.** The export and self-sufficiency cards share one
`flowThreshold` device setting, so every Flow on a device reacts at the same
level. An amount argument on the cards, following the duration argument
pattern, would allow "export above 200 W runs the pump" and "above 2000 W runs
the water heater" side by side.

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
