# Homey Sense Energy Monitor

A Homey Pro app for the [Sense Energy Monitor](https://sense.com), reporting live
power, solar production and grid exchange into Homey Energy.

Built on [sense-js-sdk](https://github.com/bourquep/sense-js-sdk), a community
library by Pascal Bourque (MIT). It is not an official Sense product, and this
app is not affiliated with Sense.

## What it provides

Two devices are paired independently from the same Sense account.

**Sense Monitor** — the home's cumulative meter.

| Capability                  | Meaning                                  |
| --------------------------- | ---------------------------------------- |
| `measure_power`             | Grid exchange; negative when exporting   |
| `measure_power.consumption` | Gross household usage                    |
| `meter_power`               | Total energy used                        |
| `meter_power.imported`      | Energy drawn from the grid               |
| `meter_power.exported`      | Energy returned to the grid              |

**Sense Solar** — offered only for monitors with solar connected.

| Capability      | Meaning                  |
| --------------- | ------------------------ |
| `measure_power` | Current production       |
| `meter_power`   | Total energy produced    |

Live power arrives continuously over a websocket. Energy totals are refreshed on
an interval that defaults to five minutes and is configurable per device.

## Why two devices

Homey Energy treats a device as either a consumer or a producer, and derives home
consumption as grid plus solar. The monitor is therefore registered as a
cumulative measuring device reporting *grid* exchange, while production is a
separate `solarpanel` device. Reporting gross household usage on the monitor
would double count the panels.

## Architecture

```
app.js                        app entrypoint
lib/SenseDriver.js            shared sign-in, MFA, monitor discovery
lib/SenseDevice.js            session restore, websocket, trend refresh
lib/sdk-logger.js             routes SDK diagnostics into the Homey log
drivers/sense_monitor/        grid and household consumption
drivers/sense_solar/          solar production
scripts/patch-sense-sdk.js    postinstall workaround, see below
```

Both drivers extend the shared `lib` classes; each driver file only maps payload
fields onto its own capabilities.

Sign-in happens once during pairing. The resulting session is serialisable and is
stored per device, then re-saved whenever the SDK rotates its tokens, so devices
survive app restarts without re-pairing. Accounts with two-factor authentication
are prompted for a code; accounts without it skip that step automatically.

## Development

Requires Node.js 18+ and a Homey Pro on the same network.

```bash
npm install
npx homey app run --remote      # upload to the hub and stream logs
npx homey app validate --level debug
```

`--remote` runs the app on the hub. Plain `homey app run` executes in a local
Docker container instead and is not needed here.

On macOS, the CLI must be run from a terminal that has Local Network permission.
VS Code's integrated terminal does not have it by default, and reports the hub as
offline; either run from Terminal.app or grant the permission under
System Settings → Privacy & Security → Local Network.

## Known limitations

**Energy totals are derived, not lifetime counters.** Sense reports energy per
period rather than as a running meter, so the app accumulates daily totals and
carries a base forward at midnight. Counters therefore start from zero when a
device is added and will not match lifetime figures in the Sense app.

**Grid power is calculated as `w - solar_w`** rather than read from the SDK's
`grid_w`. The subtraction is signed correctly by construction, so exporting
reliably reads negative.

**The SDK is patched at install time.** `sense-js-sdk` is published as ESM but
imports `dayjs/plugin/*` and `lodash/isEqual` without file extensions. Neither
dependency ships an `exports` map, so Node's ESM resolver rejects them and the
drivers fail to load. `scripts/patch-sense-sdk.js` runs on `postinstall` and
rewrites those specifiers to explicit `.js` paths. This is an upstream bug; the
script can be dropped once it is fixed.

## License

MIT
