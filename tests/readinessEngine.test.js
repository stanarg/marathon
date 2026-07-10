// readinessEngine.test.js — §9 readiness cases.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../js/logic/readinessEngine.js';

test('RHR threshold: 58 flagged, 57 normal', () => {
  assert.equal(evaluate('2026-08-12', { '2026-08-12': { rhr: 58 } }).status, 'flagged');
  assert.equal(evaluate('2026-08-12', { '2026-08-12': { rhr: 57 } }).status, 'normal');
});

test('HRV 40 vs median 58 with short sleep 5.5 → flagged', () => {
  const checkins = {
    '2026-08-10': { rhr: 50, hrvMs: 58 }, // prior baseline
    '2026-08-11': { rhr: 50, hrvMs: 58 },
    '2026-08-12': { rhr: 50, hrvMs: 40, sleepHours: 5.5 },
  };
  const v = evaluate('2026-08-12', checkins);
  assert.equal(v.status, 'flagged');
  assert.ok(v.reasons.includes('HRV crash + short sleep'));
});

test('same HRV crash but sleep 7 → normal', () => {
  const checkins = {
    '2026-08-10': { rhr: 50, hrvMs: 58 },
    '2026-08-11': { rhr: 50, hrvMs: 58 },
    '2026-08-12': { rhr: 50, hrvMs: 40, sleepHours: 7 },
  };
  assert.equal(evaluate('2026-08-12', checkins).status, 'normal');
});

test('no RHR → unknown', () => {
  assert.equal(evaluate('2026-08-12', { '2026-08-12': { sleepHours: 7, hrvMs: 55 } }).status, 'unknown');
  assert.equal(evaluate('2026-08-12', {}).status, 'unknown'); // no check-in at all
});

test('RHR flag text matches spec', () => {
  const v = evaluate('2026-08-12', { '2026-08-12': { rhr: 60 } });
  assert.deepEqual(v.reasons, ['RHR ≥ 58 (baseline 50 + 8)']);
});

test('HRV crash needs prior data (no baseline → cannot flag on HRV alone)', () => {
  // Only today's check-in exists; median is null so the HRV rule can't fire.
  const v = evaluate('2026-08-12', { '2026-08-12': { rhr: 50, hrvMs: 20, sleepHours: 4 } });
  assert.equal(v.status, 'normal');
});
