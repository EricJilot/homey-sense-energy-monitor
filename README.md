# Homey Sense Energy Monitor

This project ports the Home Assistant Sense Energy Monitor integration into a Homey app for use on a Homey hub.

## Project goals

- Recreate core Sense telemetry in Homey devices and capabilities
- Keep logic clear and testable with a Python-first domain layer
- Ship a stable Homey app package and publish source to GitHub

## Current structure

- `app.json`: Homey app manifest
- `app.js`: Homey app entrypoint
- `drivers/sense_monitor`: Homey device driver scaffold
- `python/sense_port`: Python port layer scaffold for integration logic
- `docs/porting-plan.md`: Step-by-step migration plan

## How this scaffold works

This section explains the role of the files and folders in the scaffold and how data flows between components.

- `app.json` — Homey app manifest (metadata, permissions, drivers).
- `app.js` — Homey app entrypoint. Starts the app, registers drivers, and schedules polling.
- `drivers/sense_monitor` — Homey device driver scaffold. Implements device capabilities and maps telemetry from the Python port to Homey capabilities.
- `python/sense_port` — Python port layer for integration logic. Responsible for authentication, long-running data polling, and transforming Sense telemetry into a simple JSON model consumed by the Homey driver.
- `docs/porting-plan.md` — Step-by-step guide for migrating Sense integration logic from Home Assistant or other sources into the Python port.

### Data flow summary:

1. The Python client in `python/sense_port` authenticates to the Sense API and pulls telemetry.
2. Python code normalizes telemetry into a small JSON payload (power, energy, per-circuit values).
3. The Homey driver (`drivers/sense_monitor`) invokes the Python layer (for example via a subprocess or a local HTTP bridge), receives JSON, and updates device capabilities.
4. `app.js` orchestrates driver lifecycle and scheduling for polling intervals.

This added section helps contributors understand where to implement logic and how components interact.

## Quick start

1. Install Node.js LTS and Homey CLI
2. Install Python 3.11+ and create a virtual environment
3. Run `npm install` in this repository (after `package.json` is added in the next step)
4. Implement authentication and data pull in `python/sense_port/client.py`
5. Connect Homey driver polling to Python ported logic

## GitHub publishing checklist

1. Create a new GitHub repository named `homey-sense-energy-monitor`
2. Add remote and push:

   git remote add origin https://github.com/<your-user>/homey-sense-energy-monitor.git
   git branch -M main
   git push -u origin main

## Notes

This scaffold intentionally starts simple. We will build this in small, testable increments and I can guide each step.
