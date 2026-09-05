# Homey Sense Energy Monitor

This project ports the Home Assistant Sense Energy Monitor integration into a Homey app for use on a Homey hub.

## Project goals

- Recreate core Sense telemetry in Homey devices and capabilities
- Keep logic clear and testable with a Python-first domain layer
- Ship a stable Homey app package and publish source to GitHub

## Current structure

- app.json: Homey app manifest
- app.js: Homey app entrypoint
- drivers/sense_monitor: Homey device driver scaffold
- python/sense_port: Python port layer scaffold for integration logic
- docs/porting-plan.md: step-by-step migration plan

## Quick start

1. Install Node.js LTS and Homey CLI
2. Install Python 3.11+ and create a virtual environment
3. Run npm install in this repository (after package.json is added in the next step)
4. Implement authentication and data pull in python/sense_port/client.py
5. Connect Homey driver polling to Python ported logic

## GitHub publishing checklist

1. Create a new GitHub repository named homey-sense-energy-monitor
2. Add remote and push:

   git remote add origin https://github.com/<your-user>/homey-sense-energy-monitor.git
   git branch -M main
   git push -u origin main

## Notes

This scaffold intentionally starts simple. We will build this in small, testable increments and I can guide each step.
