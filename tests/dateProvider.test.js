// dateProvider.test.js — BA-timezone civil-date conversion (locks the M7 off-by-one
// + null-guard fixes). Buenos Aires is fixed UTC−3 (no DST).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDateProvider } from '../js/dateProvider.js';

test('today() projects the instant into the BA civil date', () => {
  const dp = createDateProvider({ fixedNow: '2026-08-23T12:00:00-03:00' });
  assert.equal(dp.today(), '2026-08-23');
  assert.equal(dp.clock(), '12:00');
});

test('dateOf() converts a UTC instant to the BA civil date (evening off-by-one)', () => {
  const dp = createDateProvider();
  // 01:30 UTC on the 23rd is 22:30 BA on the 22nd — must read as the 22nd.
  assert.equal(dp.dateOf('2026-08-23T01:30:00.000Z'), '2026-08-22');
  // Noon BA is the same calendar day.
  assert.equal(dp.dateOf('2026-08-23T15:00:00.000Z'), '2026-08-23');
});

test('dateOf() returns null for an unparseable value', () => {
  const dp = createDateProvider();
  assert.equal(dp.dateOf('n/a-corrupt'), null);
  assert.equal(dp.dateOf(''), null);
  assert.equal(dp.dateOf(undefined), null);
  // null must read as null, NOT the Unix epoch (new Date(null) === 1970-01-01).
  assert.equal(dp.dateOf(null), null);
});
