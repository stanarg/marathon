// fuelingService.test.js — §9 fuelingService cases.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayPlan } from '../js/logic/fuelingService.js';
import { loadFixtures } from './fixtures.js';

const plans = loadFixtures();

test('2026-08-23: long_high + sunday_long + w06s06 fueling 45 g/h', () => {
  const dp = dayPlan('2026-08-23', plans);
  assert.equal(dp.dayType, 'long_high');
  assert.equal(dp.mealTemplateId, 'sunday_long');
  assert.ok(dp.sessionFueling, 'expected a session-fueling prescription');
  assert.equal(dp.sessionFueling.session_id, 'w06s06');
  assert.equal(dp.sessionFueling.carb_g_per_h, 45);
  assert.ok(dp.meals.length > 0, 'a non-race day has meals');
  assert.equal(dp.raceTimeline, null);
});

test('2026-09-20 (race): raceTimeline present, meals absent', () => {
  const dp = dayPlan('2026-09-20', plans);
  assert.equal(dp.dayType, 'race');
  assert.ok(dp.raceTimeline, 'race day exposes the race_plan timeline');
  assert.equal(dp.raceTimeline.race_morning.wake, '04:45');
  assert.equal(dp.meals.length, 0, 'meals are absent on race day');
  assert.equal(dp.isRaceWeek, true);
});

test('macros + shift are populated for a normal day', () => {
  const dp = dayPlan('2026-08-13', plans); // quality day, week 5 (A)
  assert.equal(dp.dayType, 'quality');
  assert.equal(dp.macros.kcal, 3300);
  assert.equal(dp.shift.schedule, 'A');
  assert.deepEqual(dp.hydrationTargetMl.range, [3000, 3500]);
  assert.equal(dp.isRaceWeek, false);
});
