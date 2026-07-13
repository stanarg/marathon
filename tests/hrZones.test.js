// hrZones.test.js — resolving session zone strings to Stan's real bpm ranges, using
// the actual workout_plan.json hr_model (ground truth, never a hand-copied fixture).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoneBpm, formatZone, formatZoneBpm, allZones } from '../js/logic/hrZones.js';
import { loadFixtures } from './fixtures.js';

const { workoutPlan } = loadFixtures();
const hr = workoutPlan.hr_model;

test('single zone resolves to that zone’s bpm range', () => {
  const b = zoneBpm('Z2', hr);
  assert.deepEqual({ minBpm: b.minBpm, maxBpm: b.maxBpm, name: b.name, idLabel: b.idLabel }, {
    minBpm: 134, maxBpm: 148, name: 'easy', idLabel: 'Z2',
  });
});

test('marathon_effort name is spaced, not underscored', () => {
  assert.equal(zoneBpm('Z3', hr).name, 'marathon effort');
});

test('hyphenated range spans min of first zone → max of last', () => {
  const b = zoneBpm('Z1-Z2', hr);
  assert.equal(b.minBpm, 100); // Z1 min
  assert.equal(b.maxBpm, 148); // Z2 max
  assert.deepEqual(b.ids, ['Z1', 'Z2']);
  assert.equal(b.idLabel, 'Z1–Z2'); // en-dash for display
  assert.equal(b.name, 'recovery–easy');
});

test('Z2-Z3 range → 134–158', () => {
  const b = zoneBpm('Z2-Z3', hr);
  assert.equal(b.minBpm, 134);
  assert.equal(b.maxBpm, 158);
});

test('unknown / empty / null zone → null', () => {
  assert.equal(zoneBpm('Z9', hr), null);
  assert.equal(zoneBpm('Z1-Z9', hr), null); // one bad id in a range fails the whole thing
  assert.equal(zoneBpm('', hr), null);
  assert.equal(zoneBpm(null, hr), null);
  assert.equal(zoneBpm('Z2', null), null); // no model
  assert.equal(zoneBpm('Z2', {}), null);
});

test('formatZone (long) and formatZoneBpm (short) render as expected', () => {
  assert.equal(formatZone('Z2', hr), 'Z2 · easy · 134–148 bpm');
  assert.equal(formatZone('Z1-Z2', hr), 'Z1–Z2 · recovery–easy · 100–148 bpm');
  assert.equal(formatZoneBpm('Z2', hr), 'Z2 · 134–148 bpm');
  assert.equal(formatZoneBpm('Z2-Z3', hr), 'Z2–Z3 · 134–158 bpm');
  assert.equal(formatZone('nope', hr), null);
  assert.equal(formatZoneBpm(null, hr), null);
});

test('allZones returns the full five-zone table', () => {
  const zs = allZones(hr);
  assert.equal(zs.length, 5);
  assert.deepEqual(zs[0], { id: 'Z1', name: 'recovery', minBpm: 100, maxBpm: 134 });
  assert.deepEqual(zs[4], { id: 'Z5', name: 'vo2', minBpm: 169, maxBpm: 190 });
  assert.deepEqual(allZones(null), []);
});

test('every zone string used by a real session resolves to a bpm range', () => {
  const sessions = workoutPlan.weeks.flatMap((w) => w.sessions);
  const zoned = sessions.filter((s) => s.zone != null);
  assert.ok(zoned.length > 0);
  for (const s of zoned) {
    const b = zoneBpm(s.zone, hr);
    assert.ok(b, `unresolved zone "${s.zone}" on ${s.id}`);
    assert.ok(b.minBpm < b.maxBpm, `bad range for ${s.id}`);
  }
  // strength sessions carry no zone → correctly null
  const strength = sessions.filter((s) => s.type === 'strength');
  assert.ok(strength.length > 0);
  for (const s of strength) assert.equal(zoneBpm(s.zone, hr), null);
});
