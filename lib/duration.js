'use strict';

const UNIT_MS = {
  seconds: 1000,
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
};

// Flow cards express a duration as an amount plus a unit dropdown.
function toMilliseconds({ amount, unit }) {
  return (amount ?? 0) * (UNIT_MS[unit] ?? UNIT_MS.minutes);
}

// True only on the tick where the elapsed time passes this Flow's own
// threshold, so each Flow fires once per episode rather than on every tick.
function crossed(args, { elapsed, previousElapsed }) {
  const target = toMilliseconds(args);
  return elapsed >= target && previousElapsed < target;
}

module.exports = { toMilliseconds, crossed };
